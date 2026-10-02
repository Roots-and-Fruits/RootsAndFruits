-- Transactional notification outbox. Disabled until staff explicitly enables it.
-- No historical orders are backfilled and no external messages are sent by SQL.
begin;
create table public.notification_settings (
  id integer primary key check (id=1),
  enabled boolean not null default false
);
insert into public.notification_settings(id) values(1);
create table public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id),
  delivery_id uuid references public.deliveries(id),
  event text not null check(event in ('received','shipped')),
  phone text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check(status in ('pending','sending','accepted','failed','unknown','skipped')),
  attempts integer not null default 0,
  provider text,
  provider_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((event='received' and delivery_id is null) or (event='shipped' and delivery_id is not null))
);
create unique index notifications_received_once on public.order_notifications(checkout_id) where event='received';
create unique index notifications_shipped_once on public.order_notifications(delivery_id) where event='shipped';
create index notifications_pending on public.order_notifications(created_at) where status='pending';
alter table public.notification_settings enable row level security;
alter table public.order_notifications enable row level security;
revoke all on public.notification_settings, public.order_notifications from anon, authenticated;
grant select, update on public.notification_settings to service_role;
grant select, update, insert on public.order_notifications to service_role;

create function private.queue_order_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.checkouts;
begin
  if not (select enabled from public.notification_settings where id=1) then return new; end if;
  if tg_table_name='checkouts' then
    -- Deferred insert trigger reads the final totals after all deliveries are saved.
    select * into strict c from public.checkouts where id=new.id;
    insert into public.order_notifications(checkout_id,event,phone,payload)
    values(c.id,'received',c.sender->>'phone',jsonb_build_object(
      'orderNumber',c.order_number,'total',c.total,
      'deliveryCount',(select count(*) from public.deliveries where checkout_id=c.id)))
    on conflict do nothing;
  else
    select * into strict c from public.checkouts where id=new.checkout_id;
    insert into public.order_notifications(checkout_id,delivery_id,event,phone,payload)
    values(c.id,new.id,'shipped',c.sender->>'phone',jsonb_build_object(
      'orderNumber',c.order_number,'position',new.position,'recipientName',new.recipient->>'name'))
    on conflict do nothing;
  end if;
  return new;
end $$;
create constraint trigger checkout_notification after insert on public.checkouts
  deferrable initially deferred for each row execute function private.queue_order_notification();
create trigger shipment_notification after update of status on public.deliveries
  for each row when (new.status='shipped' and old.status is distinct from new.status)
  execute function private.queue_order_notification();

create function public.claim_order_notifications(p_limit integer default 3)
returns setof public.order_notifications language plpgsql security definer set search_path='' as $$
begin
  -- A lost HTTP response might already have resulted in a charge/send. Never blindly retry.
  update public.order_notifications set status='unknown',error_code='INTERRUPTED',updated_at=now()
    where status='sending' and updated_at < now()-interval '5 minutes';
  if not (select enabled from public.notification_settings where id=1) then return; end if;
  update public.order_notifications n set status='skipped',error_code='CANCELLED',updated_at=now()
    from public.checkouts c where c.id=n.checkout_id and c.status='cancelled' and n.status='pending';
  return query
    update public.order_notifications n set status='sending',attempts=n.attempts+1,
      provider='solapi',error_code=null,updated_at=now()
    where n.id in (select q.id from public.order_notifications q where q.status='pending'
      order by q.created_at,q.id for update skip locked limit greatest(1,least(coalesce(p_limit,3),10)))
    returning n.*;
end $$;

create function public.configure_order_notifications(p_enabled boolean,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_staff(p_actor);
  update public.notification_settings set enabled=p_enabled where id=1;
  if not p_enabled then
    update public.order_notifications set status='skipped',error_code='DISABLED',updated_at=now() where status='pending';
  end if;
  insert into public.staff_events(actor,action,details)
    values(p_actor,'notifications_configured',jsonb_build_object('enabled',p_enabled));
end $$;

create function public.retry_order_notification(p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_staff(p_actor);
  if not (select enabled from public.notification_settings where id=1) then raise exception '문자 발송을 먼저 켜주세요.'; end if;
  update public.order_notifications set status='pending',error_code=null,updated_at=now()
    where id=p_id and status='failed';
  if found then insert into public.staff_events(actor,action,target_id) values(p_actor,'notification_retry',p_id); end if;
end $$;

revoke all on function private.queue_order_notification() from public,anon,authenticated;
revoke all on function public.claim_order_notifications(integer),
  public.configure_order_notifications(boolean,uuid),public.retry_order_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_order_notifications(integer),
  public.configure_order_notifications(boolean,uuid),public.retry_order_notification(uuid,uuid) to service_role;
commit;
