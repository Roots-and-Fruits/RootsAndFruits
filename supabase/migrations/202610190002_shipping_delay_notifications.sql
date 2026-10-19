begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table public.shipping_delay_requests (
  id uuid primary key,
  delivery_ids uuid[] not null,
  actor uuid not null references auth.users(id),
  test_mode boolean not null,
  created_at timestamptz not null default now()
);
alter table public.shipping_delay_requests enable row level security;
revoke all on public.shipping_delay_requests from anon,authenticated;
grant select on public.shipping_delay_requests to service_role;
alter table public.order_notifications add column delay_request_id uuid references public.shipping_delay_requests(id);
alter table public.order_notifications drop constraint order_notifications_event_check;
alter table public.order_notifications drop constraint order_notifications_check;
alter table public.order_notifications add constraint order_notifications_event_check check(event in ('received','shipped','delayed'));
alter table public.order_notifications add constraint notification_event_target check(
  (event='received' and delivery_id is null and delay_request_id is null) or
  (event='shipped' and delivery_id is not null and delay_request_id is null) or
  (event='delayed' and delivery_id is null and delay_request_id is not null));
create unique index shipping_delay_phone_once on public.order_notifications(delay_request_id,phone) where event='delayed';
create index shipping_delay_phone_history on public.order_notifications(phone,created_at desc,id) where event='delayed';

create function public.preview_shipping_delay(p_ids uuid[],p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_actor);
  if p_ids is null or cardinality(p_ids) not between 1 and 1000
    or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then
    raise exception '배송지를 1~1,000건 선택해주세요.';
  end if;
  if (select count(*) from public.deliveries d join public.checkouts c on c.id=d.checkout_id
    where d.id=any(p_ids) and d.status in ('waiting','exported') and c.status='paid')<>cardinality(p_ids) then
    raise exception '발송 대상이 변경되었습니다. 목록을 새로고침해주세요.';
  end if;
  if exists(select 1 from public.deliveries d join public.checkouts c on c.id=d.checkout_id
    where d.id=any(p_ids) and coalesce(c.sender->>'phone','') !~ '^01[0-9]{9}$') then
    raise exception '보내는 분 전화번호를 확인해주세요.';
  end if;
  select jsonb_agg(jsonb_build_object('phone',g.phone,'names',g.names,'deliveryIds',g.ids,
    'historyCount',(select count(*) from public.order_notifications n where n.event='delayed' and n.phone=g.phone),
    'latestId',(select n.id from public.order_notifications n where n.event='delayed' and n.phone=g.phone order by n.created_at desc,n.id desc limit 1),
    'history',coalesce((select jsonb_agg(h.value order by h.created_at desc,h.id desc) from
      (select n.created_at,n.id,jsonb_build_object('id',n.id,'createdAt',n.created_at,'status',n.status,'testMode',n.test_mode) value
      from public.order_notifications n where n.event='delayed' and n.phone=g.phone order by n.created_at desc,n.id desc limit 5) h),'[]'::jsonb)) order by g.phone)
  into result from (select c.sender->>'phone' phone, jsonb_agg(distinct c.sender->>'name') names,
    jsonb_agg(d.id order by d.id) ids from public.deliveries d join public.checkouts c on c.id=d.checkout_id
    where d.id=any(p_ids) group by c.sender->>'phone') g;
  return jsonb_build_object('recipients',result,'deliveryCount',cardinality(p_ids),'recipientCount',jsonb_array_length(result));
end $$;

create function public.queue_shipping_delay(p_request uuid,p_ids uuid[],p_expected jsonb,p_test_mode boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.notification_settings; old public.shipping_delay_requests; ids uuid[]; preview jsonb; expected jsonb; r jsonb; c uuid;
begin
  perform private.assert_staff(p_actor);
  if p_request is null then raise exception '발송 요청 번호가 필요합니다.'; end if;
  select array_agg(id order by id) into ids from unnest(p_ids) id;
  -- Same lock order as shipping/cancellation: checkout, then delivery.
  perform 1 from public.checkouts where id in (select checkout_id from public.deliveries where id=any(ids)) order by id for update;
  perform 1 from public.deliveries where id=any(ids) order by id for update;
  select * into strict s from public.notification_settings where id=1 for update;
  select * into old from public.shipping_delay_requests where id=p_request;
  if found then
    if old.delivery_ids is distinct from ids then raise exception '기존 발송 요청의 대상이 다릅니다.'; end if;
    return jsonb_build_object('requestId',p_request,'count',(select count(*) from public.order_notifications where delay_request_id=p_request),'testMode',old.test_mode);
  end if;
  if not s.enabled or s.provider<>'aligo' or s.test_mode is distinct from p_test_mode then
    raise exception '알림톡 연결과 발송 설정을 확인해주세요.';
  end if;
  preview:=public.preview_shipping_delay(ids,p_actor);
  select jsonb_agg(jsonb_build_object('phone',v->>'phone','latestId',v->'latestId') order by v->>'phone') into expected
    from jsonb_array_elements(preview->'recipients') v;
  if expected is distinct from p_expected then raise exception '지연 알림 이력이 변경되었습니다. 수신 대상과 이전 이력을 다시 확인해주세요.'; end if;
  insert into public.shipping_delay_requests(id,delivery_ids,actor,test_mode) values(p_request,ids,p_actor,p_test_mode);
  for r in select * from jsonb_array_elements(preview->'recipients') loop
    select checkout_id into strict c from public.deliveries where id=(r->'deliveryIds'->>0)::uuid;
    insert into public.order_notifications(checkout_id,event,phone,payload,provider,test_mode,recipient_role,delay_request_id)
    values(c,'delayed',r->>'phone',jsonb_build_object('deliveryIds',r->'deliveryIds','senderNames',r->'names'),
      'aligo',p_test_mode,'sender',p_request);
  end loop;
  insert into public.staff_events(actor,action,target_id,details) values(p_actor,'shipping_delay_queued',p_request,preview);
  return jsonb_build_object('requestId',p_request,'count',preview->'recipientCount','testMode',p_test_mode);
end $$;

-- Used by the confirmation screen to drain large selections in bounded requests.
create function public.claim_shipping_delay(p_request uuid,p_provider text,p_test_mode boolean,p_limit integer default 3)
returns setof public.order_notifications language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  if not s.enabled or (s.provider,s.test_mode) is distinct from (p_provider,p_test_mode) then return; end if;
  return query update public.order_notifications n set status='sending',attempts=n.attempts+1,
    error_code=null,provider_code=null,provider_id=null,prepared_message=null,updated_at=now()
    where n.id in (select q.id from public.order_notifications q where q.delay_request_id=p_request
      and q.status='pending' and q.provider=p_provider and q.test_mode=p_test_mode
      order by q.created_at,q.id for update skip locked limit greatest(1,least(coalesce(p_limit,3),10))) returning n.*;
end $$;
revoke all on function public.preview_shipping_delay(uuid[],uuid),public.queue_shipping_delay(uuid,uuid[],jsonb,boolean,uuid),public.claim_shipping_delay(uuid,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.preview_shipping_delay(uuid[],uuid),public.queue_shipping_delay(uuid,uuid[],jsonb,boolean,uuid),public.claim_shipping_delay(uuid,text,boolean,integer) to service_role;

create or replace function public.claim_notification_delivery(p_provider text,p_test_mode boolean,p_limit integer default 3)
returns setof public.order_notifications language plpgsql security definer set search_path='' as $$
declare s public.notification_settings;
begin
  select * into strict s from public.notification_settings where id=1 for share;
  update public.order_notifications set status='unknown',error_code='INTERRUPTED',updated_at=now()
    where status='sending' and updated_at < now()-interval '5 minutes';
  update public.order_notifications set status='skipped',error_code='RECIPIENT_DISABLED',updated_at=now()
    where recipient_role='recipient' and status='pending';
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
  if n.recipient_role='recipient' then
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


commit;
