-- Apply after 202610190002. Only future shipping events add recipient notifications.
-- Existing skipped/failed recipient history remains ineligible; no backfill or send.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
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
    if new.recipient->>'phone' is distinct from c.sender->>'phone' then
      insert into public.order_notifications(checkout_id,delivery_id,event,phone,payload,provider,test_mode,recipient_role)
      values(c.id,new.id,'shipped',new.recipient->>'phone',
        payload || '{"recipientShippingEnabled":true}'::jsonb,s.provider,s.test_mode,'recipient') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function public.claim_notification_delivery(p_provider text,p_test_mode boolean,p_limit integer default 3)
returns setof public.order_notifications language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  update public.order_notifications set status='unknown',error_code='INTERRUPTED',updated_at=now()
    where status='sending' and updated_at < now()-interval '5 minutes';
  update public.order_notifications set status='skipped',error_code='RECIPIENT_DISABLED',updated_at=now()
    where recipient_role='recipient' and status='pending'
      and not (event='shipped' and payload @> '{"recipientShippingEnabled":true}'::jsonb);
  if not s.enabled or (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode) then return; end if;
  update public.order_notifications n set status='skipped',error_code='CANCELLED',updated_at=now()
    from public.checkouts c where c.id=n.checkout_id and c.status='cancelled' and n.status='pending' and n.event<>'delayed';
  return query update public.order_notifications n set status='sending',attempts=n.attempts+1,
    error_code=null,provider_code=null,provider_id=null,prepared_message=null,updated_at=now()
    where n.id in (select q.id from public.order_notifications q
      where q.status='pending' and q.provider=p_provider and q.test_mode=p_test_mode
      order by q.created_at,q.id for update skip locked limit greatest(1,least(coalesce(p_limit,3),10)))
    returning n.*;
end $$;

create or replace function public.prepare_order_notification(p_id uuid,p_attempt integer,p_provider text,p_test_mode boolean,p_message jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.notification_settings; n public.order_notifications;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  select * into n from public.order_notifications where id=p_id for update;
  if not found or n.status<>'sending' or n.attempts<>p_attempt
    or (n.provider,n.test_mode) is distinct from (p_provider,p_test_mode) then return false; end if;
  if n.recipient_role='recipient' and not (n.event='shipped' and n.payload @> '{"recipientShippingEnabled":true}'::jsonb) then
    update public.order_notifications set status='skipped',error_code='RECIPIENT_DISABLED',updated_at=now() where id=p_id;
    return false;
  end if;
  if not s.enabled or (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode)
    or (n.event<>'delayed' and exists(select 1 from public.checkouts where id=n.checkout_id and status='cancelled'))
    or (n.event='delayed' and not exists(select 1 from public.deliveries d join public.checkouts c on c.id=d.checkout_id
      where d.id in (select jsonb_array_elements_text(n.payload->'deliveryIds')::uuid)
      and d.status in ('waiting','exported') and c.status='paid')) then
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
  if exists(select 1 from public.order_notifications where id=p_id and provider is distinct from 'aligo') then
    raise exception '이전 문자 서비스의 발송 건은 재시도할 수 없습니다.';
  end if;
  if exists(select 1 from public.order_notifications where id=p_id and recipient_role='recipient'
    and not (event='shipped' and payload @> '{"recipientShippingEnabled":true}'::jsonb)) then
    raise exception '이전 받는 분 알림 또는 발송 완료 이외의 받는 분 알림은 재시도할 수 없습니다.';
  end if;
  if exists(select 1 from public.order_notifications where id=p_id and status='failed'
    and (provider,test_mode) is distinct from (s.provider,s.test_mode)) then
    raise exception '현재 연결과 다른 발송 건입니다. 기존 발송 서비스에서 결과를 확인해주세요.';
  end if;
  update public.order_notifications set status='pending',error_code=null,updated_at=now() where id=p_id and status='failed';
  if found then insert into public.staff_events(actor,action,target_id) values(p_actor,'notification_retry',p_id); end if;
end $$;

commit;
