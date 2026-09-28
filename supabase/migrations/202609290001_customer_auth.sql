begin;
-- Tablet identities are provisioned only through service-role tools, never user metadata.
create table private.tablet_accounts (
  user_id uuid primary key references auth.users(id),
  username text not null unique check(username ~ '^[a-z0-9_-]{3,40}$'),
  email text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.tablet_accounts enable row level security;
revoke all on private.tablet_accounts from public,anon,authenticated;

create function public.provision_tablet(p_user uuid,p_username text,p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from private.staff where user_id=p_user) then raise exception '관리자 계정은 태블릿 계정으로 사용할 수 없습니다.'; end if;
  if p_email is distinct from lower(p_username)||'@tablet.roots-and-fruits.invalid' then raise exception '태블릿 계정 정보를 확인해주세요.'; end if;
  if not exists(select 1 from auth.users where id=p_user and email=p_email) then raise exception '인증 계정을 먼저 생성해주세요.'; end if;
  insert into private.tablet_accounts(user_id,username,email) values(p_user,lower(p_username),p_email);
end $$;
create function public.tablet_email(p_username text) returns text
language sql security definer set search_path = '' as $$
  select email from private.tablet_accounts where username=lower(p_username) and enabled;
$$;
create function public.account_kind(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from private.staff where user_id=p_user) then return 'staff'; end if;
  if exists(select 1 from private.tablet_accounts where user_id=p_user) then
    if exists(select 1 from private.tablet_accounts where user_id=p_user and enabled) then return 'tablet'; end if;
    return null;
  end if;
  if exists(select 1 from auth.identities where user_id=p_user and provider='kakao') then return 'kakao'; end if;
  return null;
end $$;

alter table public.checkouts add column member_id uuid references auth.users(id);
alter table public.checkouts add column order_source text not null default 'guest' check(order_source in ('guest','kakao','tablet'));
alter table public.checkouts add constraint checkout_member_source check((member_id is null)=(order_source='guest'));
create index checkouts_member_idx on public.checkouts(member_id) where member_id is not null;

-- Keep the existing transactional stock/price/number logic. Both functions run in one transaction.
-- Member ID comes from server-verified Auth; this RPC is never callable by public clients.
create function public.submit_customer_checkout(p_request uuid,p_payload jsonb,p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare kind text:='guest'; existing public.checkouts; result jsonb;
begin
  if p_member is not null then
    kind:=public.account_kind(p_member);
    if kind is null or kind not in ('kakao','tablet') then raise exception '고객 로그인을 다시 확인해주세요.' using errcode='28000'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into existing from public.checkouts where request_id=p_request;
  if found and (existing.member_id is distinct from p_member or existing.order_source<>kind) then
    raise exception '처음 접수한 계정으로 다시 로그인해주세요.' using errcode='28000';
  end if;
  result:=public.submit_checkout(p_request,p_payload);
  update public.checkouts set member_id=p_member,order_source=kind where request_id=p_request and existing.id is null;
  return result;
end $$;

revoke all on function public.provision_tablet(uuid,text,text), public.tablet_email(text), public.account_kind(uuid), public.submit_customer_checkout(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.provision_tablet(uuid,text,text), public.tablet_email(text), public.account_kind(uuid), public.submit_customer_checkout(uuid,jsonb,uuid) to service_role;
-- Existing staff-only order read policies remain unchanged. No tablet order-history access.
commit;
