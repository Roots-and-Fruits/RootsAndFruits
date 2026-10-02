-- One-time, manually executed pre-launch cleanup requested on 2026-10-03.
-- Run as postgres in the matching Supabase project's SQL Editor, not as a migration.
-- A private local backup was prepared. Expected counts guard this planned run.
-- Products, settings, accounts, stock adjustments and order-number sequence are kept.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkouts, public.deliveries, public.order_items,
  public.export_batches, public.export_members, public.order_notifications,
  public.stock_movements, public.staff_events, public.products,
  public.delivery_settings, public.shipping_settings, public.notification_settings
  in share row exclusive mode;

do $$
declare
  seq_before bigint;
  called_before boolean;
  preserved_before jsonb;
  preserved_after jsonb;
begin
  if (select count(*) from public.checkouts) <> 62
    or (select count(*) from public.deliveries) <> 82
    or (select count(*) from public.order_items) <> 120
    or (select count(*) from public.order_notifications) <> 2
    or (select count(*) from public.export_batches) <> 2
    or (select count(*) from public.export_members) <> 2
    or (select max(order_number) from public.checkouts) is distinct from 62::bigint
  then
    raise exception 'Data differs from the reviewed backup. Stop and review again.';
  end if;
  if exists(select 1 from public.products where inventory_enabled and not is_deleted) then
    raise exception 'Inventory-managed products exist. Stop and review again.';
  end if;
  if exists(select 1 from public.order_notifications where status = 'sending') then
    raise exception 'A notification is being sent. Stop and review again.';
  end if;

  select last_value, is_called into seq_before, called_before
    from public.checkout_number_seq;
  select jsonb_build_object(
    'products', (select jsonb_agg(to_jsonb(t) order by id) from public.products t),
    'delivery', (select jsonb_agg(to_jsonb(t) order by id) from public.delivery_settings t),
    'shipping', (select jsonb_agg(to_jsonb(t) order by id) from public.shipping_settings t),
    'notifications', (select jsonb_agg(to_jsonb(t) order by id) from public.notification_settings t),
    'users', (select jsonb_agg(id order by id) from auth.users),
    'staff', (select jsonb_agg(to_jsonb(t) order by slot) from private.staff t),
    'tablets', (select jsonb_agg(to_jsonb(t) order by user_id) from private.tablet_accounts t),
    'adjustments', (select jsonb_agg(to_jsonb(t) order by id) from public.stock_movements t where checkout_id is null),
    'events', (select jsonb_agg(to_jsonb(t) order by id) from public.staff_events t
      where action not in ('pay','cancel','note','reorder','export','shipped','notification_retry'))
  ) into preserved_before;

  delete from public.order_notifications;
  delete from public.export_members;
  delete from public.order_items;
  delete from public.stock_movements where checkout_id is not null;
  delete from public.staff_events
    where action in ('pay','cancel','note','reorder','export','shipped','notification_retry');
  delete from public.deliveries;
  delete from public.checkouts;
  delete from public.export_batches;

  if exists(select 1 from public.checkout_number_seq
    where last_value <> seq_before or is_called <> called_before) then
    raise exception 'Order-number sequence changed unexpectedly.';
  end if;
  select jsonb_build_object(
    'products', (select jsonb_agg(to_jsonb(t) order by id) from public.products t),
    'delivery', (select jsonb_agg(to_jsonb(t) order by id) from public.delivery_settings t),
    'shipping', (select jsonb_agg(to_jsonb(t) order by id) from public.shipping_settings t),
    'notifications', (select jsonb_agg(to_jsonb(t) order by id) from public.notification_settings t),
    'users', (select jsonb_agg(id order by id) from auth.users),
    'staff', (select jsonb_agg(to_jsonb(t) order by slot) from private.staff t),
    'tablets', (select jsonb_agg(to_jsonb(t) order by user_id) from private.tablet_accounts t),
    'adjustments', (select jsonb_agg(to_jsonb(t) order by id) from public.stock_movements t where checkout_id is null),
    'events', (select jsonb_agg(to_jsonb(t) order by id) from public.staff_events t
      where action not in ('pay','cancel','note','reorder','export','shipped','notification_retry'))
  ) into preserved_after;
  if preserved_before is distinct from preserved_after then
    raise exception 'Products, settings or accounts changed unexpectedly.';
  end if;
end $$;
commit;

select
  (select count(*) from public.checkouts) as checkouts,
  (select count(*) from public.deliveries) as deliveries,
  (select count(*) from public.order_items) as order_items,
  (select count(*) from public.order_notifications) as notifications,
  (select count(*) from public.export_batches) as export_batches,
  (select count(*) from public.export_members) as export_members,
  (select count(*) from public.products) as products,
  (select count(*) from auth.users) as accounts,
  last_value as sequence_last_value, is_called as sequence_is_called
from public.checkout_number_seq;
