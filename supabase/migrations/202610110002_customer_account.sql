-- Run manually after 202610110001_reorder_kind.sql. No existing orders are changed.
begin;

create table if not exists public.customer_senders (
  member_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 80),
  phone text not null check(phone ~ '^[0-9]{11}$')
);
create table if not exists public.customer_addresses (
  id uuid primary key,
  member_id uuid not null references auth.users(id) on delete cascade,
  label text not null check(length(btrim(label)) between 1 and 80),
  name text not null check(length(btrim(name)) between 1 and 80),
  phone text not null check(phone ~ '^[0-9]{11}$'),
  postal_code text not null check(length(btrim(postal_code)) between 1 and 20),
  address text not null check(length(btrim(address)) between 1 and 500),
  address_detail text not null check(length(btrim(address_detail)) between 1 and 500),
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists customer_addresses_member_idx on public.customer_addresses(member_id);
create unique index if not exists customer_addresses_default_idx on public.customer_addresses(member_id) where is_default;
create index if not exists checkouts_customer_history_idx on public.checkouts(member_id,order_number desc)
  where order_source='kakao' and original_id is null;
alter table public.customer_senders enable row level security;
alter table public.customer_addresses enable row level security;
-- All access goes through server-verified member RPCs, including service-role writes.
revoke all on public.customer_senders,public.customer_addresses from public,anon,authenticated,service_role;

create or replace function private.assert_customer(p_member uuid) returns void
language plpgsql stable set search_path='' as $$
begin
  if p_member is null or public.account_kind(p_member) is distinct from 'kakao' then
    raise exception '카카오 개인 회원만 이용할 수 있습니다.' using errcode='28000';
  end if;
end $$;

create or replace function public.customer_preferences(p_member uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.assert_customer(p_member);
  select jsonb_build_object(
    'sender',(select jsonb_build_object('name',name,'phone',phone) from public.customer_senders where member_id=p_member),
    'addresses',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'name',name,'phone',phone,'postalCode',postal_code,
      'address',address,'addressDetail',address_detail,'isDefault',is_default
    ) order by is_default desc,updated_at desc,id) from public.customer_addresses where member_id=p_member),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.save_customer_sender(p_member uuid,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_customer(p_member);
  if jsonb_typeof(p_value) is distinct from 'object'
    or jsonb_typeof(p_value->'name') is distinct from 'string'
    or jsonb_typeof(p_value->'phone') is distinct from 'string' then
    raise exception '보내는 분 정보를 확인해주세요.';
  end if;
  insert into public.customer_senders(member_id,name,phone)
    values(p_member,btrim(p_value->>'name'),p_value->>'phone')
    on conflict(member_id) do update set name=excluded.name,phone=excluded.phone;
end $$;

create or replace function public.save_customer_address(p_member uuid,p_id uuid,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_customer(p_member);
  if p_id is null or jsonb_typeof(p_value) is distinct from 'object'
    or jsonb_typeof(p_value->'isDefault') is distinct from 'boolean'
    or exists(select 1 from unnest(array['label','name','phone','postalCode','address','addressDetail']) k
      where jsonb_typeof(p_value->k) is distinct from 'string') then
    raise exception '저장할 배송지를 확인해주세요.';
  end if;
  -- Serialize a member's default changes; never clear a different member's default.
  perform pg_advisory_xact_lock(hashtextextended('customer-address:'||p_member::text,0));
  if exists(select 1 from public.customer_addresses where id=p_id and member_id<>p_member) then
    raise exception '배송지를 찾을 수 없습니다.';
  end if;
  if (p_value->>'isDefault')::boolean then
    update public.customer_addresses set is_default=false where member_id=p_member and is_default and id<>p_id;
  end if;
  insert into public.customer_addresses(id,member_id,label,name,phone,postal_code,address,address_detail,is_default)
    values(p_id,p_member,btrim(p_value->>'label'),btrim(p_value->>'name'),p_value->>'phone',
      btrim(p_value->>'postalCode'),btrim(p_value->>'address'),btrim(p_value->>'addressDetail'),(p_value->>'isDefault')::boolean)
    on conflict(id) do update set label=excluded.label,name=excluded.name,phone=excluded.phone,
      postal_code=excluded.postal_code,address=excluded.address,address_detail=excluded.address_detail,
      is_default=excluded.is_default,updated_at=now()
      where public.customer_addresses.member_id=p_member;
  if not found then raise exception '배송지를 찾을 수 없습니다.'; end if;
end $$;

create or replace function public.delete_customer_address(p_member uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_customer(p_member);
  perform pg_advisory_xact_lock(hashtextextended('customer-address:'||p_member::text,0));
  delete from public.customer_addresses where id=p_id and member_id=p_member;
end $$;

-- Explicit customer DTO: never return staff notes, consent, request payloads or audit data.
create or replace function private.customer_order(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',c.id,'order_number',c.order_number,'category',c.category,'created_at',c.created_at,
    'status',c.status,'subtotal',c.subtotal,'discount',c.discount,'total',c.total,
    'sender',jsonb_build_object('name',c.sender->>'name','phone',c.sender->>'phone'),
    'deliveries',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'position',d.position,'status',d.status,'processing_date',d.processing_date,
      'subtotal',d.subtotal,'discount',d.discount,'total',d.total,
      'recipient',jsonb_build_object('name',d.recipient->>'name','phone',d.recipient->>'phone',
        'postalCode',d.recipient->>'postalCode','address',d.recipient->>'address','addressDetail',d.recipient->>'addressDetail'),
      'tracking_numbers',private.delivery_tracking(d.id),
      'order_items',coalesce((select jsonb_agg(jsonb_build_object(
        'label',i.label,'weight_grams',i.weight_grams,'quantity',i.quantity,'unit_price',i.unit_price
      ) order by i.id) from public.order_items i where i.delivery_id=d.id),'[]'::jsonb)
    ) order by d.position) from public.deliveries d where d.checkout_id=c.id),'[]'::jsonb)
  ) from public.checkouts c where c.id=p_id;
$$;

create or replace function public.list_customer_orders(p_member uuid,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.assert_customer(p_member);
  with candidates as (
    select id,order_number from public.checkouts where member_id=p_member and order_source='kakao'
      and original_id is null and (p_before is null or order_number<p_before)
      order by order_number desc limit 21
  ), page as (select * from candidates order by order_number desc limit 20)
  select jsonb_build_object(
    'orders',coalesce((select jsonb_agg(private.customer_order(id) order by order_number desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>20 then (select min(order_number)::text from page) else null end
  ) into result;
  return result;
end $$;

create or replace function public.get_customer_order(p_member uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_customer(p_member);
  if not exists(select 1 from public.checkouts where id=p_id and member_id=p_member and order_source='kakao' and original_id is null) then
    return null;
  end if;
  return private.customer_order(p_id);
end $$;

revoke all on function private.assert_customer(uuid),private.customer_order(uuid) from public,anon,authenticated;
revoke all on function public.customer_preferences(uuid),public.save_customer_sender(uuid,jsonb),
  public.save_customer_address(uuid,uuid,jsonb),public.delete_customer_address(uuid,uuid),
  public.list_customer_orders(uuid,bigint),public.get_customer_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_preferences(uuid),public.save_customer_sender(uuid,jsonb),
  public.save_customer_address(uuid,uuid,jsonb),public.delete_customer_address(uuid,uuid),
  public.list_customer_orders(uuid,bigint),public.get_customer_order(uuid,uuid) to service_role;
commit;
