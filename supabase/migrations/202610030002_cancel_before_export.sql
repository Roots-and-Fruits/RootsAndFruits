-- Allow whole-order cancellation before ANY shipment has been exported.
-- No existing orders, payment history or order-number sequence are rewritten.
-- Run after 202610020002_payment_method.sql. POS refunds remain external.
begin;

alter table public.checkouts drop constraint checkouts_payment_method_status;
alter table public.checkouts add constraint checkouts_payment_method_status
  check (payment_method is null or status in ('paid','cancelled'));

create or replace function public.change_checkout(
  p_id uuid,p_action text,p_actor uuid,p_payment_method text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.checkouts; m record;
begin
  perform private.assert_staff(p_actor);
  -- Shared lock order with commit_export: checkouts, then deliveries, then products.
  select * into strict c from public.checkouts where id=p_id for update;
  if p_action='pay' then
    if p_payment_method is null or p_payment_method not in ('card','cash','transfer','other') then
      raise exception '결제 방식을 선택해주세요.';
    end if;
    if c.status='paid' then return; end if;
    if c.status<>'pending' then raise exception '결제 대기 주문만 결제 처리할 수 있습니다.'; end if;
    update public.checkouts set status='paid',paid_at=now(),payment_method=p_payment_method where id=p_id;
  elsif p_action='cancel' then
    if c.status='cancelled' then return; end if;
    if c.status not in ('pending','paid') then raise exception '취소할 수 없는 주문입니다.'; end if;
    perform 1 from public.deliveries where checkout_id=p_id order by id for update;
    if exists(select 1 from public.deliveries where checkout_id=p_id and status<>'waiting')
       or exists(select 1 from public.export_members e join public.deliveries d on d.id=e.delivery_id where d.checkout_id=p_id) then
      raise exception '엑셀 출력된 배송지가 있어 주문을 취소할 수 없습니다.';
    end if;
    -- Return only stock actually deducted at submission, even if stock management is now off.
    for m in select product_id,-delta as qty from public.stock_movements where checkout_id=p_id and reason='order' order by product_id loop
      update public.products set stock_quantity=coalesce(stock_quantity,0)+m.qty where id=m.product_id;
      insert into public.stock_movements(product_id,checkout_id,delta,reason,actor) values(m.product_id,p_id,m.qty,'cancel',p_actor);
    end loop;
    -- Preserve payment_method, paid_at, amounts and immutable order snapshots.
    update public.checkouts set status='cancelled',cancelled_at=now() where id=p_id;
  else raise exception '지원하지 않는 상태 변경입니다.'; end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,p_action,p_id);
end $$;

create or replace function public.commit_export(
  p_id uuid,p_ids uuid[],p_filename text,p_file text,p_actor uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare expected integer;
begin
  perform private.assert_staff(p_actor);
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  if exists(select 1 from public.export_batches where id=p_id) then
    if (select array_agg(delivery_id order by delivery_id) from public.export_members where batch_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_ids) x) then raise exception '출력 요청 내용이 변경되었습니다.'; end if;
    return p_id;
  end if;
  expected:=cardinality(p_ids);
  if expected is null or expected<1 or expected>1000 or expected<>(select count(distinct x) from unnest(p_ids) x) then raise exception '출력 대상을 확인해주세요.'; end if;
  -- Lock parents before children so cancellation and export cannot both succeed.
  -- Multiple orders in a batch are locked in a deterministic order.
  perform 1 from public.checkouts c where exists(
    select 1 from public.deliveries d where d.checkout_id=c.id and d.id=any(p_ids)
  ) order by c.id for update;
  perform 1 from public.deliveries where id=any(p_ids) order by id for update;
  if (select count(*) from public.deliveries d join public.checkouts c on c.id=d.checkout_id where d.id=any(p_ids) and c.status='paid' and d.status='waiting')<>expected then raise exception '출력 대상 상태가 변경되었습니다. 목록을 새로고침해주세요.'; end if;
  insert into public.export_batches(id,created_by,filename,file_base64) values(p_id,p_actor,p_filename,p_file);
  insert into public.export_members select p_id,x from unnest(p_ids) x;
  update public.deliveries set status='exported' where id=any(p_ids);
  insert into public.staff_events(actor,action,target_id) values(p_actor,'export',p_id);
  return p_id;
end $$;

revoke all on function public.change_checkout(uuid,text,uuid,text),
  public.commit_export(uuid,uuid[],text,text,uuid) from public,anon,authenticated;
grant execute on function public.change_checkout(uuid,text,uuid,text),
  public.commit_export(uuid,uuid[],text,text,uuid) to service_role;

commit;
