begin;

-- Existing paid orders retain an unknown method; no historical data is inferred.
alter table public.checkouts add column payment_method text
  check (payment_method in ('card','cash','transfer','other'));
alter table public.checkouts add constraint checkouts_payment_method_status
  check (payment_method is null or status = 'paid');

-- Replace the old signature so a payment cannot bypass method validation.
drop function public.change_checkout(uuid,text,uuid);
create function public.change_checkout(p_id uuid,p_action text,p_actor uuid,p_payment_method text default null) returns void language plpgsql security definer set search_path = '' as $$
declare c public.checkouts; m record;
begin
  perform private.assert_staff(p_actor);
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
    if c.status<>'pending' then raise exception '결제 전 주문만 취소할 수 있습니다.'; end if;
    for m in select product_id,-delta as qty from public.stock_movements where checkout_id=p_id and reason='order' order by product_id loop
      update public.products set stock_quantity=coalesce(stock_quantity,0)+m.qty where id=m.product_id;
      insert into public.stock_movements(product_id,checkout_id,delta,reason,actor) values(m.product_id,p_id,m.qty,'cancel',p_actor);
    end loop;
    update public.checkouts set status='cancelled',cancelled_at=now() where id=p_id;
  else raise exception '지원하지 않는 상태 변경입니다.'; end if;
  insert into public.staff_events(actor,action,target_id) values(p_actor,p_action,p_id);
end $$;

revoke all on function public.change_checkout(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.change_checkout(uuid,text,uuid,text) to service_role;

commit;
