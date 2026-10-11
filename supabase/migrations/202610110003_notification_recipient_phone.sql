-- Run manually after 202610100001_aligo_only_notifications.sql.
-- Adds the recipient phone to NEW order-received notification snapshots only.
-- Preserves orders, notification history, delivery settings and sender-only routing.
-- Does not enqueue, resend or send any messages.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.notification_delivery(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'position',d.position,
    'recipientName',d.recipient->>'name',
    'recipientPhone',d.recipient->>'phone',
    'address',d.recipient->>'address',
    'addressDetail',coalesce(d.recipient->>'addressDetail',''),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'label',i.label,'weightGrams',i.weight_grams,'quantity',i.quantity
    ) order by i.id) from public.order_items i where i.delivery_id=d.id),'[]'::jsonb)
  ) from public.deliveries d where d.id=p_id;
$$;
revoke all on function private.notification_delivery(uuid) from public,anon,authenticated;

commit;
