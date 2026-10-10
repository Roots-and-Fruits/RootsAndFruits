-- Run manually in Supabase SQL Editor after the previous migrations.
-- Existing orders keep their original label; no orders are cancelled or sent.
begin;

alter table public.checkouts add column if not exists reorder_kind text
  check (reorder_kind in ('correction','repeat'))
  check (reorder_kind is null or original_id is not null);

-- Reuse order creation, pricing, inventory and notification logic atomically.
-- The same request ID cannot change kind, original order, actor or payload.
create or replace function public.submit_reorder_checkout(
  p_request uuid,p_payload jsonb,p_actor uuid,p_original uuid,p_kind text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.checkouts; result jsonb;
begin
  perform private.assert_staff(p_actor);
  if p_request is null or p_original is null or p_kind is null
    or p_kind not in ('correction','repeat') then
    raise exception '재접수 구분과 원본 주문을 확인해주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into existing from public.checkouts where request_id=p_request;
  if found and existing.reorder_kind is distinct from p_kind then
    raise exception '같은 접수 요청의 구분이 변경되었습니다.';
  end if;
  result:=public.submit_checkout(p_request,p_payload,p_actor,p_original);
  if existing.id is null then
    update public.checkouts set reorder_kind=p_kind where request_id=p_request;
    update public.staff_events set details=details||jsonb_build_object('kind',p_kind,'original_id',p_original)
      where action='reorder' and target_id=(select id from public.checkouts where request_id=p_request);
  end if;
  return result;
end $$;

revoke all on function public.submit_reorder_checkout(uuid,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_reorder_checkout(uuid,jsonb,uuid,uuid,text) to service_role;
commit;
