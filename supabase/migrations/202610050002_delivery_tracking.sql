-- Run manually in Supabase SQL Editor after 202610050001_shipping_worklist.sql.
-- Adds tracking storage only. Existing orders, exports and notifications are preserved.
begin;

alter table public.deliveries add column if not exists tracking_version integer not null default 0;
create table if not exists public.delivery_tracking_numbers (
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  tracking_number text not null check (tracking_number ~ '^[0-9]{1,40}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  primary key(delivery_id,tracking_number)
);
-- Request receipts make a lost save response safely retryable, including replacements.
create table if not exists public.tracking_imports (
  id uuid primary key,
  actor uuid not null references auth.users(id),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.delivery_tracking_numbers enable row level security;
alter table public.tracking_imports enable row level security;
revoke all on public.delivery_tracking_numbers,public.tracking_imports from public,anon,authenticated;
grant select on public.delivery_tracking_numbers,public.tracking_imports to service_role;

create or replace function private.delivery_tracking(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(tracking_number order by tracking_number),'[]'::jsonb)
  from public.delivery_tracking_numbers where delivery_id=p_id;
$$;
revoke all on function private.delivery_tracking(uuid) from public,anon,authenticated;

create or replace function public.preview_delivery_tracking(p_keys text[],p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_actor);
  if cardinality(p_keys)>1000 then raise exception '한 번에 1,000행까지 확인할 수 있습니다.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',c.order_number::text||'-'||d.position::text,'id',d.id,
    'recipient',d.recipient->>'name','checkout_status',c.status,'status',d.status,
    'processing_date',d.processing_date,'version',d.tracking_version,
    'tracking_numbers',private.delivery_tracking(d.id)
  ) order by c.order_number,d.position),'[]'::jsonb) into result
  from public.deliveries d join public.checkouts c on c.id=d.checkout_id
  where c.order_number::text||'-'||d.position::text=any(p_keys);
  return result;
end $$;

create or replace function public.save_delivery_tracking(p_changes jsonb,p_request uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.tracking_imports; x jsonb; d public.deliveries; c public.checkouts;
  before_numbers jsonb; after_numbers jsonb; result jsonb:='[]'::jsonb;
begin
  perform private.assert_staff(p_actor);
  if p_request is null or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 1000 then
    raise exception '송장 저장 대상을 확인해주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into previous from public.tracking_imports where id=p_request;
  if found then
    if previous.actor<>p_actor or previous.payload<>p_changes then
      raise exception '같은 송장 저장 요청의 내용이 변경되었습니다.';
    end if;
    return previous.result;
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_changes))<>jsonb_array_length(p_changes) then
    raise exception '배송지가 중복되었습니다.';
  end if;
  if (select coalesce(sum(jsonb_array_length(value->'numbers')),0) from jsonb_array_elements(p_changes))>1000 then
    raise exception '한 번에 1,000개 송장까지 저장할 수 있습니다.';
  end if;
  -- Same parent/child lock order as cancellation and export.
  perform 1 from public.checkouts where id in (
    select checkout_id from public.deliveries where id in (select (value->>'id')::uuid from jsonb_array_elements(p_changes))
  ) order by id for update;
  perform 1 from public.deliveries where id in (select (value->>'id')::uuid from jsonb_array_elements(p_changes)) order by id for update;
  for x in select value from jsonb_array_elements(p_changes) loop
    select * into d from public.deliveries where id=(x->>'id')::uuid;
    if not found then raise exception '배송주문을 찾을 수 없습니다. 파일을 다시 확인해주세요.'; end if;
    select * into strict c from public.checkouts where id=d.checkout_id;
    if x->>'key' is distinct from c.order_number::text||'-'||d.position::text
      or c.status<>'paid' or d.status not in ('exported','shipped') then
      raise exception '주문 상태가 변경되었습니다. 파일을 다시 확인해주세요.';
    end if;
    if (x->>'version')::integer is distinct from d.tracking_version then
      raise exception '다른 관리자가 송장번호를 변경했습니다. 파일을 다시 확인해주세요.';
    end if;
    if coalesce(x->>'mode','') not in ('add','replace')
      or jsonb_typeof(x->'numbers') is distinct from 'array'
      or jsonb_array_length(x->'numbers') not between 1 and 1000 then
      raise exception '송장번호와 추가·교체 선택을 확인해주세요.';
    end if;
    if exists(select 1 from jsonb_array_elements(x->'numbers') n
      where jsonb_typeof(n)<>'string' or (n#>>'{}') !~ '^[0-9]{1,40}$') then
      raise exception '송장번호는 숫자로 된 문자열이어야 합니다.';
    end if;
    before_numbers:=private.delivery_tracking(d.id);
    if x->>'mode'='replace' then
      delete from public.delivery_tracking_numbers where delivery_id=d.id
        and tracking_number not in (select jsonb_array_elements_text(x->'numbers'));
    end if;
    insert into public.delivery_tracking_numbers(delivery_id,tracking_number,created_by)
      select d.id,n,p_actor from (select distinct jsonb_array_elements_text(x->'numbers') n) v
      on conflict do nothing;
    after_numbers:=private.delivery_tracking(d.id);
    if before_numbers<>after_numbers then
      update public.deliveries set tracking_version=tracking_version+1 where id=d.id;
      insert into public.staff_events(actor,action,target_id,details)
        values(p_actor,'tracking',d.id,jsonb_build_object('request_id',p_request,'mode',x->>'mode','before',before_numbers,'after',after_numbers));
    end if;
    result:=result||jsonb_build_array(jsonb_build_object(
      'id',d.id,'status',d.status,'processing_date',d.processing_date,'tracking_numbers',after_numbers));
  end loop;
  insert into public.tracking_imports(id,actor,payload,result) values(p_request,p_actor,p_changes,result);
  return result;
end $$;
revoke all on function public.preview_delivery_tracking(text[],uuid),public.save_delivery_tracking(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.preview_delivery_tracking(text[],uuid),public.save_delivery_tracking(jsonb,uuid,uuid) to service_role;

-- List functions below keep their existing filters, ordering and sibling data.

create or replace function public.list_checkouts(p_filters jsonb,p_page integer,p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
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
 select jsonb_build_object('count',(select count(*) from matched),'orders',coalesce((select jsonb_agg((to_jsonb(c)-'request_payload'-'request_id')||jsonb_build_object('original_number',(select order_number from public.checkouts where id=c.original_id),'deliveries',(select jsonb_agg(to_jsonb(d)||jsonb_build_object('tracking_numbers',private.delivery_tracking(d.id),'order_items',(select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id)) order by d.position) from public.deliveries d where d.checkout_id=c.id)) order by c.order_number desc) from page c),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.list_shipping_work(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_actor);
  with active as (
    select c.* from public.checkouts c
    where c.status='paid' and exists (
      select 1 from public.deliveries d where d.checkout_id=c.id
        and d.status in ('waiting','exported')
    )
  )
  select jsonb_build_object(
    'count', (select count(*) from public.deliveries d join active c on c.id=d.checkout_id where d.status in ('waiting','exported')),
    -- Keep all siblings for whole-order detail/cancellation checks, even when
    -- some have shipped. The worklist displays only the active deliveries.
    'orders', coalesce((select jsonb_agg(
      (to_jsonb(c)-'request_payload'-'request_id') || jsonb_build_object(
        'original_number',(select order_number from public.checkouts where id=c.original_id),
        'deliveries',(select jsonb_agg(to_jsonb(d)||jsonb_build_object(
          'tracking_numbers',private.delivery_tracking(d.id),'order_items',(select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id)
        ) order by d.position) from public.deliveries d where d.checkout_id=c.id)
      ) order by c.order_number
    ) from active c),'[]'::jsonb)
  ) into result;
  return result;
end $$;

commit;
