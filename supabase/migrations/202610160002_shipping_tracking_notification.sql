-- Apply after the sender-only and delivery-tracking migrations.
-- Snapshots tracking numbers only for newly shipped deliveries; no resend/backfill.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select id from public.notification_settings where id=1 for update;

create or replace function private.queue_order_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.checkouts; s public.notification_settings; payload jsonb;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  if not s.enabled then return new; end if;
  if tg_table_name='checkouts' then
    select * into strict c from public.checkouts where id=new.id;
    insert into public.order_notifications(checkout_id,event,phone,payload,provider,test_mode)
    values(c.id,'received',c.sender->>'phone',jsonb_build_object(
      'orderNumber',c.order_number,'category',c.category,'total',c.total,
      'deliveryCount',(select count(*) from public.deliveries where checkout_id=c.id),
      'deliveries',(select jsonb_agg(private.notification_delivery(d.id) order by d.position)
        from public.deliveries d where d.checkout_id=c.id)),s.provider,s.test_mode)
    on conflict do nothing;
  else
    select * into strict c from public.checkouts where id=new.checkout_id;
    payload:=jsonb_build_object('orderNumber',c.order_number,'category',c.category,'position',new.position,
      'senderName',c.sender->>'name','recipientName',new.recipient->>'name',
      'items',private.notification_delivery(new.id)->'items',
      'trackingNumbers',private.delivery_tracking(new.id));
    insert into public.order_notifications(checkout_id,delivery_id,event,phone,payload,provider,test_mode)
    values(c.id,new.id,'shipped',c.sender->>'phone',payload,s.provider,s.test_mode) on conflict do nothing;
  end if;
  return new;
end $$;

revoke all on function private.queue_order_notification() from public,anon,authenticated;
commit;
