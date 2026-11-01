-- Special discounts reduce each unit price before the existing per-delivery bundle discount.
-- Historical order amounts stay unchanged. NULL original prices identify pre-migration snapshots.
begin;
alter table public.products
  add column special_discount_enabled boolean not null default false,
  add column special_discount_amount integer not null default 0,
  add constraint products_special_discount_valid check (
    special_discount_amount between 0 and 100000000
    and (not special_discount_enabled or (special_discount_amount > 0 and special_discount_amount <= price))
    and (category='product' or (not special_discount_enabled and special_discount_amount=0))
  );
alter table public.order_items
  add column original_unit_price integer check (original_unit_price >= 0),
  add column special_discount_amount integer not null default 0 check (special_discount_amount >= 0),
  add constraint order_items_special_discount_valid check (
    (original_unit_price is null and special_discount_amount=0)
    or (original_unit_price is not null and original_unit_price=unit_price+special_discount_amount)
  );

create or replace function public.save_product_with_special_discount(p_id uuid,p_data jsonb,p_actor uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; new_id uuid:=coalesce(p_id,gen_random_uuid()); qty integer; position integer;
begin
  perform private.assert_staff(p_actor);
  perform pg_advisory_xact_lock(726341,1);
  perform 1 from public.products order by id for update;
  if p_id is not null then select * into strict previous from public.products where id=p_id for update; end if;
  if p_id is null or previous.category<>p_data->>'category' or previous.fruit_type is distinct from p_data->>'fruit_type' then
    select coalesce(max(sort_order),-1)+1 into position from public.products where category=p_data->>'category' and not is_deleted;
  else position:=previous.sort_order; end if;
  -- Experience never adjusts stock. Keep any historical balance for old cancellation records.
  qty:=case when p_data->>'category'='experience' then previous.stock_quantity
    else coalesce((p_data->>'stock_quantity')::integer,previous.stock_quantity,0) end;
  insert into public.products(id,category,fruit_type,weight_grams,description,price,is_active,inventory_enabled,stock_quantity,sort_order,bundle_eligible,is_deleted,special_discount_enabled,special_discount_amount)
  values(new_id,p_data->>'category',p_data->>'fruit_type',(p_data->>'weight_grams')::integer,p_data->>'description',(p_data->>'price')::integer,(p_data->>'is_active')::boolean,coalesce((p_data->>'inventory_enabled')::boolean,false),qty,position,coalesce((p_data->>'bundle_eligible')::boolean,false),coalesce((p_data->>'is_deleted')::boolean,false),coalesce((p_data->>'special_discount_enabled')::boolean,false),coalesce((p_data->>'special_discount_amount')::integer,0))
  on conflict(id) do update set category=excluded.category,fruit_type=excluded.fruit_type,weight_grams=excluded.weight_grams,description=excluded.description,price=excluded.price,is_active=excluded.is_active,inventory_enabled=excluded.inventory_enabled,stock_quantity=excluded.stock_quantity,sort_order=excluded.sort_order,bundle_eligible=excluded.bundle_eligible,is_deleted=excluded.is_deleted,special_discount_enabled=excluded.special_discount_enabled,special_discount_amount=excluded.special_discount_amount;
  if p_data->>'category'='product' and qty<>coalesce(previous.stock_quantity,0) then insert into public.stock_movements(product_id,delta,reason,actor) values(new_id,qty-coalesce(previous.stock_quantity,0),'adjustment',p_actor); end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,'product',new_id);
  perform private.normalize_product_order(p_data->>'category');
  return new_id;
end $$;

create or replace function public.submit_checkout(p_request uuid,p_payload jsonb,p_actor uuid default null,p_original uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; d jsonb; item jsonb; prod public.products; did uuid;
  pos integer:=0; qty integer; sale_price integer; special_amount integer; sub bigint; eligible_sub bigint; eligible_qty bigint; disc bigint;
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
  if p_original is not null and exists(select 1 from public.products p where p.category='product' and p.inventory_enabled and p.stock_quantity<=0 and p.id in (select (i->>'productId')::uuid from jsonb_array_elements(p_payload->'deliveries') dd, lateral jsonb_array_elements(dd->'items') i)) then raise exception '품절 상품을 변경해주세요.'; end if;
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
      values(c.id,pos,d->'recipient',d->>'deliveryMode',dt,dt-1,case when c.category='product' then config.bundle_discount else 0 end) returning id into did;
    for item in select value from jsonb_array_elements(d->'items') loop
      qty:=(item->>'quantity')::integer;
      if qty < 1 or qty>100000 then raise exception '수량을 확인해주세요.'; end if;
      select * into strict prod from public.products where id=(item->>'productId')::uuid;
      if not prod.is_active or prod.is_deleted or prod.category<>c.category then raise exception '판매하지 않는 상품을 변경해주세요.'; end if;
      special_amount:=case when prod.category='product' and prod.special_discount_enabled then prod.special_discount_amount else 0 end;
      sale_price:=prod.price-special_amount;
      sub:=sub+sale_price::bigint*qty;
      if prod.category='product' and prod.bundle_eligible then eligible_qty:=eligible_qty+qty; eligible_sub:=eligible_sub+sale_price::bigint*qty; end if;
      insert into public.order_items(delivery_id,product_id,label,weight_grams,unit_price,quantity,bundle_eligible,inventory_deducted,original_unit_price,special_discount_amount)
        values(did,prod.id,case when prod.category='experience' then prod.description else prod.fruit_type||' '||trim_scale(prod.weight_grams::numeric/1000)::text||'kg · '||prod.description end,prod.weight_grams,sale_price,qty,prod.category='product' and prod.bundle_eligible,prod.category='product' and prod.inventory_enabled,prod.price,special_amount);
      if prod.category='product' and prod.inventory_enabled then
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
revoke all on function public.save_product_with_special_discount(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_product_with_special_discount(uuid,jsonb,uuid) to service_role;
commit;
