-- Run manually AFTER 202610070001_sender_only_notifications.sql.
-- Retires SMS sending while retaining orders and notification history.
-- Existing Aligo enabled/test settings remain unchanged. A legacy connection is
-- changed to Aligo OFF/test mode so this SQL never starts real sending.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select id from public.notification_settings where id=1 for update;

update public.order_notifications
set status='skipped',error_code='PROVIDER_RETIRED',updated_at=now()
where provider is distinct from 'aligo' and status in ('pending','failed');
-- A request already handed to the previous provider cannot be recalled.
update public.order_notifications
set status='unknown',error_code='INTERRUPTED',updated_at=now()
where provider is distinct from 'aligo' and status='sending';

update public.notification_settings
set provider='aligo',enabled=false,test_mode=true
where provider is distinct from 'aligo';
alter table public.notification_settings alter column provider set default 'aligo';
alter table public.notification_settings drop constraint if exists notification_settings_provider_check;
alter table public.notification_settings add constraint notification_settings_provider_check check(provider='aligo');
alter table public.order_notifications alter column provider set default 'aligo';

-- Remove the old SMS-only claim entry point; internal Aligo outbox processing stays.
drop function if exists public.claim_order_notifications(integer);

create or replace function public.configure_notification_delivery(p_enabled boolean,p_provider text,p_test_mode boolean,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  perform private.assert_staff(p_actor);
  if p_provider is null or p_provider<>'aligo' or p_enabled is null or p_test_mode is null then raise exception '알림 연결 설정을 확인해주세요.'; end if;
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

create or replace function public.retry_order_notification(p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  perform private.assert_staff(p_actor);
  select * into strict s from public.notification_settings where id=1 for share;
  if not s.enabled then raise exception '알림 발송을 먼저 켜주세요.'; end if;
  if exists(select 1 from public.order_notifications where id=p_id and provider is distinct from 'aligo') then
    raise exception '이전 문자 서비스의 발송 건은 재시도할 수 없습니다.';
  end if;
  if exists(select 1 from public.order_notifications where id=p_id and recipient_role='recipient') then
    raise exception '받는 분 대상 알림은 재발송하지 않습니다. 보내는 분에게만 안내합니다.';
  end if;
  if exists(select 1 from public.order_notifications where id=p_id and status='failed'
    and (provider,test_mode) is distinct from (s.provider,s.test_mode)) then
    raise exception '현재 연결과 다른 발송 건입니다. 기존 발송 서비스에서 결과를 확인해주세요.';
  end if;
  update public.order_notifications set status='pending',error_code=null,updated_at=now() where id=p_id and status='failed';
  if found then insert into public.staff_events(actor,action,target_id) values(p_actor,'notification_retry',p_id); end if;
end $$;

revoke all on function public.configure_notification_delivery(boolean,text,boolean,uuid),
  public.retry_order_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.configure_notification_delivery(boolean,text,boolean,uuid),
  public.retry_order_notification(uuid,uuid) to service_role;
commit;
