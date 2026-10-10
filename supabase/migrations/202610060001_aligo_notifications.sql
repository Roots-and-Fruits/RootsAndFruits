-- Run manually in Supabase SQL Editor after the previous migrations.
-- Keeps existing orders/history and the current enabled setting. Does not send messages.
begin;

alter table public.notification_settings
  add column if not exists provider text not null default 'solapi' check(provider in ('solapi','aligo')),
  add column if not exists test_mode boolean not null default false;
alter table public.order_notifications
  add column if not exists test_mode boolean not null default false,
  add column if not exists recipient_role text not null default 'sender' check(recipient_role in ('sender','recipient')),
  add column if not exists provider_code text,
  add column if not exists prepared_message jsonb;
-- All records created before this migration belong to the original SOLAPI flow.
update public.order_notifications set provider='solapi' where provider is null;
alter table public.order_notifications drop constraint if exists order_notifications_status_check;
alter table public.order_notifications add constraint order_notifications_status_check
  check(status in ('pending','sending','accepted','tested','failed','unknown','skipped'));
-- Alimtalk shipment notices go to sender and recipient; identical phones get one notice.
drop index if exists public.notifications_shipped_once;
create unique index notifications_shipped_once on public.order_notifications(delivery_id,phone) where event='shipped';

create or replace function public.configure_notification_delivery(p_enabled boolean,p_provider text,p_test_mode boolean,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  perform private.assert_staff(p_actor);
  if p_provider is null or p_provider not in ('solapi','aligo') or p_enabled is null or p_test_mode is null
    or (p_provider='solapi' and p_test_mode) then raise exception '알림 연결 설정을 확인해주세요.'; end if;
  select * into strict s from public.notification_settings where id=1 for update;
  update public.order_notifications set status='unknown',error_code='INTERRUPTED',updated_at=now()
    where status='sending' and updated_at < now()-interval '5 minutes';
  if (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode)
    and exists(select 1 from public.order_notifications where status='sending') then
    raise exception '전송 중인 알림이 있습니다. 처리가 끝난 뒤 연결을 변경해주세요.';
  end if;
  update public.notification_settings set enabled=p_enabled,provider=p_provider,test_mode=p_test_mode where id=1;
  update public.order_notifications set status='skipped',
    error_code=case when not p_enabled then 'DISABLED' else 'PROVIDER_CHANGED' end,updated_at=now()
    where status='pending' and (not p_enabled or (provider,test_mode) is distinct from (p_provider,p_test_mode));
  insert into public.staff_events(actor,action,details) values(p_actor,'notifications_configured',
    jsonb_build_object('enabled',p_enabled,'provider',p_provider,'test_mode',p_test_mode));
end $$;

-- Compatibility for older application instances: they cannot switch the provider.
create or replace function public.configure_order_notifications(p_enabled boolean,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  perform private.assert_staff(p_actor);
  select * into strict s from public.notification_settings where id=1 for update;
  perform public.configure_notification_delivery(p_enabled,s.provider,s.test_mode,p_actor);
end $$;

create or replace function public.claim_notification_delivery(p_provider text,p_test_mode boolean,p_limit integer default 3)
returns setof public.order_notifications language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  update public.order_notifications set status='unknown',error_code='INTERRUPTED',updated_at=now()
    where status='sending' and updated_at < now()-interval '5 minutes';
  if not s.enabled or (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode) then return; end if;
  update public.order_notifications n set status='skipped',error_code='CANCELLED',updated_at=now()
    from public.checkouts c where c.id=n.checkout_id and c.status='cancelled' and n.status='pending';
  return query update public.order_notifications n set status='sending',attempts=n.attempts+1,
    error_code=null,provider_code=null,provider_id=null,prepared_message=null,updated_at=now()
    where n.id in (select q.id from public.order_notifications q
      where q.status='pending' and q.provider=p_provider and q.test_mode=p_test_mode
      order by q.created_at,q.id for update skip locked limit greatest(1,least(coalesce(p_limit,3),10)))
    returning n.*;
end $$;
create or replace function public.claim_order_notifications(p_limit integer default 3)
returns setof public.order_notifications language sql security definer set search_path='' as $$
  select * from public.claim_notification_delivery('solapi',false,p_limit);
$$;

create or replace function public.prepare_order_notification(p_id uuid,p_attempt integer,p_provider text,p_test_mode boolean,p_message jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.notification_settings; n public.order_notifications;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  select * into n from public.order_notifications where id=p_id for update;
  if not found or n.status<>'sending' or n.attempts<>p_attempt
    or (n.provider,n.test_mode) is distinct from (p_provider,p_test_mode) then return false; end if;
  if not s.enabled or (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode)
    or exists(select 1 from public.checkouts where id=n.checkout_id and status='cancelled') then
    update public.order_notifications set status='skipped',error_code='DISABLED_OR_CANCELLED',updated_at=now() where id=p_id;
    return false;
  end if;
  if jsonb_typeof(p_message) is distinct from 'object' or coalesce(p_message->>'text','')='' then
    raise exception '알림 본문을 확인해주세요.';
  end if;
  update public.order_notifications set prepared_message=p_message,updated_at=now() where id=p_id;
  return true;
end $$;

create or replace function public.retry_order_notification(p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  perform private.assert_staff(p_actor);
  select * into strict s from public.notification_settings where id=1 for share;
  if not s.enabled then raise exception '알림 발송을 먼저 켜주세요.'; end if;
  if exists(select 1 from public.order_notifications where id=p_id and status='failed'
    and (provider,test_mode) is distinct from (s.provider,s.test_mode)) then
    raise exception '현재 연결과 다른 발송 건입니다. 기존 발송 서비스에서 결과를 확인해주세요.';
  end if;
  update public.order_notifications set status='pending',error_code=null,updated_at=now() where id=p_id and status='failed';
  if found then insert into public.staff_events(actor,action,target_id) values(p_actor,'notification_retry',p_id); end if;
end $$;

create or replace function private.notification_delivery(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('position',d.position,'recipientName',d.recipient->>'name',
    'address',d.recipient->>'address','addressDetail',coalesce(d.recipient->>'addressDetail',''),
    'items',coalesce((select jsonb_agg(jsonb_build_object('label',i.label,'weightGrams',i.weight_grams,'quantity',i.quantity)
      order by i.id) from public.order_items i where i.delivery_id=d.id),'[]'::jsonb))
  from public.deliveries d where d.id=p_id;
$$;

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
      'items',private.notification_delivery(new.id)->'items');
    insert into public.order_notifications(checkout_id,delivery_id,event,phone,payload,provider,test_mode)
    values(c.id,new.id,'shipped',c.sender->>'phone',payload,s.provider,s.test_mode) on conflict do nothing;
    if s.provider='aligo' and regexp_replace(new.recipient->>'phone','[^0-9]','','g')
      is distinct from regexp_replace(c.sender->>'phone','[^0-9]','','g') then
      insert into public.order_notifications(checkout_id,delivery_id,event,phone,payload,provider,test_mode,recipient_role)
      values(c.id,new.id,'shipped',new.recipient->>'phone',payload,s.provider,s.test_mode,'recipient') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.notification_delivery(uuid) from public,anon,authenticated;
revoke all on function public.configure_notification_delivery(boolean,text,boolean,uuid),
  public.claim_notification_delivery(text,boolean,integer),public.prepare_order_notification(uuid,integer,text,boolean,jsonb)
  from public,anon,authenticated;
grant execute on function public.configure_notification_delivery(boolean,text,boolean,uuid),
  public.claim_notification_delivery(text,boolean,integer),public.prepare_order_notification(uuid,integer,text,boolean,jsonb)
  to service_role;
commit;
