-- Preserve existing relative order, but keep each fruit group contiguous.
begin;
create function private.normalize_product_order(p_category text) returns void
language sql set search_path = '' as $$
  with ordered as (
    select id,fruit_type,row_number() over(order by sort_order,id) as position
    from public.products where category=p_category and not is_deleted
  ), grouped as (
    select *,min(position) over(partition by fruit_type) as group_position from ordered
  ), ranked as (
    select id,(row_number() over(order by group_position,position)-1)::integer as position from grouped
  )
  update public.products p set sort_order=r.position from ranked r where p.id=r.id and p.sort_order<>r.position;
$$;
revoke all on function private.normalize_product_order(text) from public,anon,authenticated;
select private.normalize_product_order('product');
select private.normalize_product_order('experience');

-- The expected snapshot prevents one owner overwriting another owner's sorting.
create function public.reorder_products(p_category text,p_ids uuid[],p_expected jsonb,p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; current_ids uuid[]; group_count integer; transitions integer;
begin
  perform private.assert_staff(p_actor);
  if p_category not in ('product','experience') or p_category is null then raise exception '상품 구분을 확인해주세요.'; end if;
  perform pg_advisory_xact_lock(726341,1);
  perform 1 from public.products where category=p_category and not is_deleted order by id for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'fruit_type',fruit_type,'sort_order',sort_order) order by sort_order,id),'[]'::jsonb),
         coalesce(array_agg(id order by sort_order,id),'{}'::uuid[])
    into snapshot,current_ids from public.products where category=p_category and not is_deleted;
  if p_ids is null or cardinality(p_ids)<>cardinality(current_ids)
     or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id)
     or not(p_ids @> current_ids and current_ids @> p_ids) then
    raise exception '상품 목록이 변경되었습니다. 목록을 다시 불러온 뒤 정렬해주세요.';
  end if;
  -- A retry of an already-applied ordering has no duplicate effect.
  if p_ids=current_ids and (select jsonb_agg(x-'sort_order' order by x->>'id') from jsonb_array_elements(snapshot) x)
    is not distinct from (select jsonb_agg(x-'sort_order' order by x->>'id') from jsonb_array_elements(p_expected) x) then return; end if;
  if snapshot is distinct from p_expected then raise exception '다른 관리자가 상품 목록을 변경했습니다. 목록을 다시 불러온 뒤 정렬해주세요.'; end if;
  select count(distinct fruit_type) into group_count from public.products where id=any(p_ids);
  select count(*) into transitions from (
    select p.fruit_type,lag(p.fruit_type) over(order by u.position) as previous
    from unnest(p_ids) with ordinality u(id,position) join public.products p on p.id=u.id
  ) x where previous is distinct from fruit_type;
  if transitions<>group_count then raise exception '같은 과일의 상품은 한 그룹 안에서 정렬해주세요.'; end if;
  update public.products p set sort_order=(u.position-1)::integer
    from unnest(p_ids) with ordinality u(id,position) where p.id=u.id;
  insert into public.staff_events(actor,action,details) values(p_actor,'product_order',jsonb_build_object('category',p_category,'ids',p_ids));
end $$;
revoke all on function public.reorder_products(text,uuid[],jsonb,uuid) from public,anon,authenticated;
grant execute on function public.reorder_products(text,uuid[],jsonb,uuid) to service_role;

create or replace function public.save_product(p_id uuid,p_data jsonb,p_actor uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.products; new_id uuid:=coalesce(p_id,gen_random_uuid()); qty integer; position integer;
begin
  perform private.assert_staff(p_actor);
  perform pg_advisory_xact_lock(726341,1);
  perform 1 from public.products order by id for update;
  if p_id is not null then select * into strict previous from public.products where id=p_id for update; end if;
  if p_id is null or previous.category<>p_data->>'category' or previous.fruit_type<>p_data->>'fruit_type' then
    select coalesce(max(sort_order),-1)+1 into position from public.products where category=p_data->>'category' and not is_deleted;
  else position:=previous.sort_order; end if;
  qty:=coalesce((p_data->>'stock_quantity')::integer,previous.stock_quantity,0);
  insert into public.products(id,category,fruit_type,weight_grams,description,price,is_active,inventory_enabled,stock_quantity,sort_order,bundle_eligible,is_deleted)
  values(new_id,p_data->>'category',p_data->>'fruit_type',(p_data->>'weight_grams')::integer,p_data->>'description',(p_data->>'price')::integer,(p_data->>'is_active')::boolean,(p_data->>'inventory_enabled')::boolean,qty,position,(p_data->>'bundle_eligible')::boolean,coalesce((p_data->>'is_deleted')::boolean,false))
  on conflict(id) do update set category=excluded.category,fruit_type=excluded.fruit_type,weight_grams=excluded.weight_grams,description=excluded.description,price=excluded.price,is_active=excluded.is_active,inventory_enabled=excluded.inventory_enabled,stock_quantity=excluded.stock_quantity,sort_order=excluded.sort_order,bundle_eligible=excluded.bundle_eligible,is_deleted=excluded.is_deleted;
  if qty<>coalesce(previous.stock_quantity,0) then insert into public.stock_movements(product_id,delta,reason,actor) values(new_id,qty-coalesce(previous.stock_quantity,0),'adjustment',p_actor); end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,'product',new_id);
  perform private.normalize_product_order(p_data->>'category');
  return new_id;
end $$;
commit;
