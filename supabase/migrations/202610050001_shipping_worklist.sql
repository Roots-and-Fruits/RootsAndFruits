-- Shipping worklist: all paid, unshipped deliveries. No order data is rewritten.
-- Run manually in Supabase SQL Editor after the existing migrations.
begin;

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
          'order_items',(select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id)
        ) order by d.position) from public.deliveries d where d.checkout_id=c.id)
      ) order by c.order_number
    ) from active c),'[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Match worklist ordering; keep the existing workbook columns and snapshots.
create or replace function public.export_rows(p_ids uuid[],p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_actor);
  select coalesce(jsonb_agg(jsonb_build_object(
    'checkout',to_jsonb(c)-'request_payload'-'request_id',
    'delivery',to_jsonb(d)||jsonb_build_object('order_items',(
      select jsonb_agg(i order by i.id) from public.order_items i where i.delivery_id=d.id
    ))
  ) order by d.processing_date desc,c.order_number,d.position),'[]'::jsonb)
  into result from public.deliveries d join public.checkouts c on c.id=d.checkout_id
  where d.id=any(p_ids) and c.status='paid';
  return result;
end $$;

revoke all on function public.list_shipping_work(uuid),public.export_rows(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.list_shipping_work(uuid),public.export_rows(uuid[],uuid) to service_role;
commit;
