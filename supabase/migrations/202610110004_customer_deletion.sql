-- Run manually after 202610110002_customer_account.sql and the other existing migrations.
-- Installing this migration deletes no accounts or orders and sends no notifications.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.checkouts add column if not exists member_deleted_at timestamptz;
alter table public.checkouts drop constraint if exists checkout_member_source;
alter table public.checkouts add constraint checkout_member_source check (
  (member_id is null and order_source='guest' and member_deleted_at is null)
  or (member_id is not null and order_source in ('kakao','tablet') and member_deleted_at is null)
  or (member_id is null and order_source='kakao' and member_deleted_at is not null)
);

-- Supabase Auth deletes the user in a transaction. Preserve the order snapshot
-- and original order source while detaching the account. Address/sender rows use
-- their existing ON DELETE CASCADE. Failure rolls the entire deletion back.
create or replace function private.preserve_deleted_customer_orders() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.checkouts set member_id=null,member_deleted_at=now()
    where member_id=old.id and order_source='kakao';
  return old;
end $$;
drop trigger if exists preserve_customer_orders on auth.users;
create trigger preserve_customer_orders before delete on auth.users
  for each row execute function private.preserve_deleted_customer_orders();
revoke all on function private.preserve_deleted_customer_orders() from public,anon,authenticated;

-- Read-only preflight: do not unlink Kakao before the preservation migration exists.
create or replace function public.customer_deletion_ready(p_member uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_customer(p_member);
  return exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='auth.users'::regclass and tgname='preserve_customer_orders' and tgenabled in ('O','A'));
end $$;
revoke all on function public.customer_deletion_ready(uuid) from public,anon,authenticated;
grant execute on function public.customer_deletion_ready(uuid) to service_role;
commit;
