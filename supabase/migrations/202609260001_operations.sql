-- All writes go through guarded server endpoints and service-role RPCs.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.staff (
  slot smallint primary key check (slot in (1,2)),
  user_id uuid not null unique references auth.users(id),
  username text not null unique check (username ~ '^[a-zA-Z0-9_-]{3,40}$'),
  email text not null unique
);
create function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.staff where user_id = auth.uid());
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, service_role;
create function public.staff_email(p_username text) returns text language sql security definer set search_path = '' as $$
  select email from private.staff where username = p_username;
$$;
create function public.provision_staff(p_slot smallint, p_user uuid, p_username text, p_email text) returns void language sql security definer set search_path = '' as $$
  insert into private.staff values(p_slot,p_user,p_username,p_email)
  ;
$$;
create function private.assert_staff(p_actor uuid) returns void language plpgsql set search_path = '' as $$
begin
  if p_actor is null or not exists(select 1 from private.staff where user_id=p_actor) then
    raise exception '관리자 권한이 필요합니다.';
  end if;
end $$;

alter table public.products add column bundle_eligible boolean not null default false;
alter table public.products add column is_deleted boolean not null default false;
alter table public.delivery_settings add column bundle_discount integer not null default 0 check(bundle_discount >= 0);
create table public.shipping_settings (
  id integer primary key default 1 check(id=1),
  postal_code text not null default '', address text not null default ''
);
insert into public.shipping_settings(id) values(1);
drop policy "Public active products" on public.products;
create policy "Public active products" on public.products for select to anon,authenticated using(is_active and not is_deleted);
create policy "Staff catalog" on public.products for select to authenticated using(public.is_staff());

create sequence public.checkout_number_seq;
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.checkout_number_seq'),
  request_id uuid not null unique,
  request_payload jsonb not null,
  category text not null check(category in ('product','experience')),
  sender jsonb not null,
  subtotal bigint not null default 0, discount bigint not null default 0, total bigint not null default 0,
  status text not null default 'pending' check(status in ('pending','paid','cancelled')),
  original_id uuid references public.checkouts(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz, cancelled_at timestamptz,
  check(subtotal between 0 and 9007199254740991 and discount>=0 and discount<=subtotal and total=subtotal-discount)
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id),
  position integer not null,
  recipient jsonb not null,
  delivery_mode text not null check(delivery_mode in ('regular','scheduled')),
  requested_date date not null, processing_date date not null,
  subtotal bigint not null default 0, discount bigint not null default 0, total bigint not null default 0,
  discount_unit integer not null,
  status text not null default 'waiting' check(status in ('waiting','exported','shipped')),
  note text not null default '', shipped_at timestamptz,
  unique(checkout_id,position),
  check(subtotal between 0 and 9007199254740991 and discount>=0 and discount<=subtotal and total=subtotal-discount)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id),
  product_id uuid not null references public.products(id),
  label text not null, weight_grams integer not null,
  unit_price integer not null check(unit_price>=0), quantity integer not null check(quantity>0),
  bundle_eligible boolean not null, inventory_deducted boolean not null,
  unique(delivery_id,product_id)
);
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  checkout_id uuid references public.checkouts(id),
  delta integer not null, reason text not null, actor uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(product_id,checkout_id,reason)
);
create table public.staff_events (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id), action text not null, target_id uuid,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.export_batches (
  id uuid primary key,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  filename text not null, file_base64 text not null
);
create table public.export_members (
  batch_id uuid not null references public.export_batches(id),
  delivery_id uuid primary key references public.deliveries(id)
);
create index deliveries_checkout_idx on public.deliveries(checkout_id);
create index deliveries_processing_idx on public.deliveries(processing_date,status);
create index items_delivery_idx on public.order_items(delivery_id);
create index checkouts_created_idx on public.checkouts(created_at desc);

-- Anonymous clients cannot read orders or invoke the write functions.
do $$ declare t text; begin
  foreach t in array array['checkouts','deliveries','order_items','stock_movements','staff_events','export_batches','export_members','shipping_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy "Staff read" on public.%I for select to authenticated using(public.is_staff())',t);
  end loop;
end $$;

create function public.submit_checkout(p_request uuid,p_payload jsonb,p_actor uuid default null,p_original uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; d jsonb; item jsonb; prod public.products; did uuid;
  pos integer:=0; qty integer; sub bigint; eligible_sub bigint; eligible_qty bigint; disc bigint;
  config public.delivery_settings; today date := (now() at time zone 'Asia/Seoul')::date; dt date;
begin
  -- A transaction lock makes retries and concurrent deliveries deterministic.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into c from public.checkouts where request_id=p_request;
  if found then
    if c.request_payload <> p_payload or c.original_id is distinct from p_original or c.created_by is distinct from p_actor then
      raise exception '같은 접수 요청의 내용이 변경되었습니다.';
    end if;
    return jsonb_build_object('orderNumber',c.order_number,'total',c.total);
  end if;
  if p_actor is not null or p_original is not null then perform private.assert_staff(p_actor); end if;
  if p_original is not null and not exists(select 1 from public.checkouts where id=p_original and category=p_payload->>'category') then raise exception '원본 주문을 찾을 수 없습니다.'; end if;
  if p_payload->>'category' not in ('product','experience') or jsonb_array_length(p_payload->'deliveries') not between 1 and 100
     or coalesce((p_payload->'sender'->>'privacyConsent')::boolean,false)=false then raise exception '주문 입력을 확인해주세요.'; end if;
  select * into strict config from public.delivery_settings where id=1 for share;
  -- Lock all involved products in a fixed order. Negative stock is allowed intentionally.
  perform 1 from public.products where id in (
    select (i->>'productId')::uuid from jsonb_array_elements(p_payload->'deliveries') dd,
    lateral jsonb_array_elements(dd->'items') i
  ) order by id for update;
  if p_original is not null and exists(select 1 from public.products p where p.inventory_enabled and p.stock_quantity<=0 and p.id in (select (i->>'productId')::uuid from jsonb_array_elements(p_payload->'deliveries') dd, lateral jsonb_array_elements(dd->'items') i)) then raise exception '품절 상품을 변경해주세요.'; end if;
  insert into public.checkouts(request_id,request_payload,category,sender,created_by,original_id)
    values(p_request,p_payload,p_payload->>'category',p_payload->'sender',p_actor,p_original) returning * into c;
  for d in select value from jsonb_array_elements(p_payload->'deliveries') loop
    pos:=pos+1; sub:=0; eligible_sub:=0; eligible_qty:=0;
    if jsonb_array_length(d->'items') < 1 then raise exception '상품을 선택해주세요.'; end if;
    if d->>'deliveryMode'='regular' then dt:=today+2;
    else
      dt:=(d->>'requestedDate')::date;
      if p_payload->>'category'='experience' or dt < today+3 or dt > today+config.max_days or extract(dow from dt)=0 then raise exception '예약 날짜를 다시 선택해주세요.'; end if;
    end if;
    insert into public.deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,discount_unit)
      values(c.id,pos,d->'recipient',d->>'deliveryMode',dt,dt-1,config.bundle_discount) returning id into did;
    for item in select value from jsonb_array_elements(d->'items') loop
      qty:=(item->>'quantity')::integer;
      if qty < 1 or qty>100000 then raise exception '수량을 확인해주세요.'; end if;
      select * into strict prod from public.products where id=(item->>'productId')::uuid;
      if not prod.is_active or prod.is_deleted or prod.category<>c.category then raise exception '판매하지 않는 상품을 변경해주세요.'; end if;
      sub:=sub+prod.price::bigint*qty;
      if prod.bundle_eligible then eligible_qty:=eligible_qty+qty; eligible_sub:=eligible_sub+prod.price::bigint*qty; end if;
      insert into public.order_items(delivery_id,product_id,label,weight_grams,unit_price,quantity,bundle_eligible,inventory_deducted)
        values(did,prod.id,prod.fruit_type||' '||trim_scale(prod.weight_grams::numeric/1000)::text||'kg · '||prod.description,prod.weight_grams,prod.price,qty,prod.bundle_eligible,prod.inventory_enabled);
      if prod.inventory_enabled then
        update public.products set stock_quantity=stock_quantity-qty where id=prod.id;
        insert into public.stock_movements(product_id,checkout_id,delta,reason,actor) values(prod.id,c.id,-qty,'order',p_actor)
          on conflict(product_id,checkout_id,reason) do update set delta=public.stock_movements.delta+excluded.delta;
      end if;
    end loop;
    disc:=least(eligible_sub,(eligible_qty/2)*config.bundle_discount);
    update public.deliveries set subtotal=sub,discount=disc,total=sub-disc where id=did;
  end loop;
  update public.checkouts set subtotal=(select sum(subtotal) from public.deliveries where checkout_id=c.id),discount=(select sum(discount) from public.deliveries where checkout_id=c.id),total=(select sum(total) from public.deliveries where checkout_id=c.id) where id=c.id returning * into c;
  if p_actor is not null then insert into public.staff_events(actor,action,target_id) values(p_actor,'reorder',c.id); end if;
  return jsonb_build_object('orderNumber',c.order_number,'total',c.total);
end $$;

create function public.change_checkout(p_id uuid,p_action text,p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c public.checkouts; m record;
begin
  perform private.assert_staff(p_actor);
  select * into strict c from public.checkouts where id=p_id for update;
  if p_action='pay' then
    if c.status='paid' then return; end if;
    if c.status<>'pending' then raise exception '결제 대기 주문만 결제 처리할 수 있습니다.'; end if;
    update public.checkouts set status='paid',paid_at=now() where id=p_id;
  elsif p_action='cancel' then
    if c.status='cancelled' then return; end if;
    if c.status<>'pending' then raise exception '결제 전 주문만 취소할 수 있습니다.'; end if;
    for m in select product_id,-delta as qty from public.stock_movements where checkout_id=p_id and reason='order' order by product_id loop
      update public.products set stock_quantity=coalesce(stock_quantity,0)+m.qty where id=m.product_id;
      insert into public.stock_movements(product_id,checkout_id,delta,reason,actor) values(m.product_id,p_id,m.qty,'cancel',p_actor);
    end loop;
    update public.checkouts set status='cancelled',cancelled_at=now() where id=p_id;
  else raise exception '지원하지 않는 상태 변경입니다.'; end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,p_action,p_id);
end $$;

create function public.save_product(p_id uuid,p_data jsonb,p_actor uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; new_id uuid:=coalesce(p_id,gen_random_uuid()); qty integer;
begin
  perform private.assert_staff(p_actor);
  if p_id is not null then select * into strict previous from public.products where id=p_id for update; end if;
  qty:=coalesce((p_data->>'stock_quantity')::integer,previous.stock_quantity,0);
  insert into public.products(id,category,fruit_type,weight_grams,description,price,is_active,inventory_enabled,stock_quantity,sort_order,bundle_eligible,is_deleted)
  values(new_id,p_data->>'category',p_data->>'fruit_type',(p_data->>'weight_grams')::integer,p_data->>'description',(p_data->>'price')::integer,(p_data->>'is_active')::boolean,(p_data->>'inventory_enabled')::boolean,qty,(p_data->>'sort_order')::integer,(p_data->>'bundle_eligible')::boolean,coalesce((p_data->>'is_deleted')::boolean,false))
  on conflict(id) do update set category=excluded.category,fruit_type=excluded.fruit_type,weight_grams=excluded.weight_grams,description=excluded.description,price=excluded.price,is_active=excluded.is_active,inventory_enabled=excluded.inventory_enabled,stock_quantity=excluded.stock_quantity,sort_order=excluded.sort_order,bundle_eligible=excluded.bundle_eligible,is_deleted=excluded.is_deleted;
  if qty<>coalesce(previous.stock_quantity,0) then insert into public.stock_movements(product_id,delta,reason,actor) values(new_id,qty-coalesce(previous.stock_quantity,0),'adjustment',p_actor); end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,'product',new_id);
  return new_id;
end $$;
create function public.save_settings(p_data jsonb,p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_actor);
  update public.delivery_settings set max_days=(p_data->>'max_days')::integer,bundle_discount=(p_data->>'bundle_discount')::integer where id=1;
  update public.shipping_settings set postal_code=p_data->>'postal_code',address=p_data->>'address' where id=1;
  insert into public.staff_events(actor,action,details) values(p_actor,'settings',p_data);
end $$;
create function public.save_note(p_id uuid,p_note text,p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_actor);
  update public.deliveries set note=p_note where id=p_id;
  if not found then raise exception '배송주문을 찾을 수 없습니다.'; end if;
  insert into public.staff_events(actor,action,target_id,details) values(p_actor,'note',p_id,jsonb_build_object('note',p_note));
end $$;
create function public.commit_export(p_id uuid,p_ids uuid[],p_filename text,p_file text,p_actor uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare expected integer;
begin
  perform private.assert_staff(p_actor);
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  if exists(select 1 from public.export_batches where id=p_id) then
    if (select array_agg(delivery_id order by delivery_id) from public.export_members where batch_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_ids) x) then raise exception '출력 요청 내용이 변경되었습니다.'; end if;
    return p_id;
  end if;
  expected:=cardinality(p_ids);
  if expected<1 or expected>1000 or expected<>(select count(distinct x) from unnest(p_ids) x) then raise exception '출력 대상을 확인해주세요.'; end if;
  perform 1 from public.deliveries where id=any(p_ids) order by id for update;
  if (select count(*) from public.deliveries d join public.checkouts c on c.id=d.checkout_id where d.id=any(p_ids) and c.status='paid' and d.status='waiting')<>expected then raise exception '출력 대상 상태가 변경되었습니다. 목록을 새로고침해주세요.'; end if;
  insert into public.export_batches(id,created_by,filename,file_base64) values(p_id,p_actor,p_filename,p_file);
  insert into public.export_members select p_id,x from unnest(p_ids) x;
  update public.deliveries set status='exported' where id=any(p_ids);
  insert into public.staff_events(actor,action,target_id) values(p_actor,'export',p_id);
  return p_id;
end $$;
create function public.mark_shipped(p_ids uuid[],p_actor uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_actor);
  if cardinality(p_ids) not between 1 and 1000 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception '발송 대상을 선택해주세요.'; end if;
  if (select count(*) from public.deliveries where id=any(p_ids))<>cardinality(p_ids) then raise exception '배송주문을 찾을 수 없습니다.'; end if;
  perform 1 from public.deliveries where id=any(p_ids) order by id for update;
  if exists(select 1 from public.deliveries d join public.checkouts c on c.id=d.checkout_id where d.id=any(p_ids) and (c.status<>'paid' or d.status='waiting')) then raise exception '결제 및 엑셀 출력 후 발송 처리해주세요.'; end if;
  insert into public.staff_events(actor,action,target_id) select p_actor,'shipped',id from public.deliveries where id=any(p_ids) and status='exported';
  update public.deliveries set status='shipped',shipped_at=now() where id=any(p_ids) and status='exported';
end $$;
-- Supabase grants functions to PUBLIC by default; restrict every write explicitly.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('staff_email','provision_staff','submit_checkout','change_checkout','save_product','save_settings','save_note','commit_export','mark_shipped') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.staff_directory() returns table(user_id uuid,username text) language sql security definer set search_path = '' as $$ select user_id,username from private.staff order by slot; $$;
revoke all on function public.staff_directory() from public,anon,authenticated;
grant execute on function public.staff_directory() to service_role;

create function public.list_checkouts(p_filters jsonb,p_page integer,p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform private.assert_staff(p_actor);
 if p_page<0 then raise exception '페이지를 확인해주세요.'; end if;
 with matched as (
  select c.* from public.checkouts c where
   (coalesce(p_filters->>'id','')='' or c.id=(p_filters->>'id')::uuid) and
   (coalesce(p_filters->>'number','')='' or c.order_number=(p_filters->>'number')::bigint) and
   (coalesce(p_filters->>'sender','')='' or strpos(lower(c.sender->>'name'),lower(p_filters->>'sender'))>0) and
   (coalesce(p_filters->>'status','')='' or c.status=p_filters->>'status') and
   (coalesce(p_filters->>'date','')='' or (c.created_at at time zone 'Asia/Seoul')::date=(p_filters->>'date')::date) and
   exists(select 1 from public.deliveries d where d.checkout_id=c.id and
    (coalesce(p_filters->>'recipient','')='' or strpos(lower(d.recipient->>'name'),lower(p_filters->>'recipient'))>0) and
    (coalesce(p_filters->>'processing','')='' or d.processing_date=(p_filters->>'processing')::date) and
    (coalesce(p_filters->>'shipping','')='' or d.status=p_filters->>'shipping') and
    (coalesce(p_filters->>'product','')='' or exists(select 1 from public.order_items i where i.delivery_id=d.id and i.product_id=(p_filters->>'product')::uuid)))
 ), page as (select * from matched order by order_number desc limit 30 offset p_page*30)
 select jsonb_build_object('count',(select count(*) from matched),'orders',coalesce((select jsonb_agg((to_jsonb(c)-'request_payload'-'request_id')||jsonb_build_object('original_number',(select order_number from public.checkouts where id=c.original_id),'deliveries',(select jsonb_agg(to_jsonb(d)||jsonb_build_object('order_items',(select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id)) order by d.position) from public.deliveries d where d.checkout_id=c.id)) order by c.order_number desc) from page c),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.list_checkouts(jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.list_checkouts(jsonb,integer,uuid) to service_role;

-- POST/RPC avoids URL length limits when selecting hundreds of deliveries.
create function public.export_rows(p_ids uuid[],p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform private.assert_staff(p_actor);
 select coalesce(jsonb_agg(jsonb_build_object('checkout',to_jsonb(c)-'request_payload'-'request_id','delivery',to_jsonb(d)||jsonb_build_object('order_items',(select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id))) order by c.order_number,d.position),'[]'::jsonb)
 into result from public.deliveries d join public.checkouts c on c.id=d.checkout_id where d.id=any(p_ids) and c.status='paid';
 return result;
end $$;
revoke all on function public.export_rows(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.export_rows(uuid[],uuid) to service_role;
