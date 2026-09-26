-- Initial catalog only. Order writes and admin permissions are not enabled yet.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('product', 'experience')),
  fruit_type text not null check (length(btrim(fruit_type)) > 0),
  weight_grams integer not null check (weight_grams > 0),
  description text not null default '',
  price integer not null check (price >= 0),
  is_active boolean not null default false,
  inventory_enabled boolean not null default false,
  stock_quantity integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (not inventory_enabled or stock_quantity is not null)
);
create table public.delivery_settings (
  id integer primary key default 1 check (id = 1),
  max_days integer not null check (max_days >= 3)
);
alter table public.products enable row level security;
alter table public.delivery_settings enable row level security;
revoke all on public.products, public.delivery_settings from anon, authenticated;
grant select on public.products, public.delivery_settings to anon, authenticated;
create policy "Public active products" on public.products
  for select to anon, authenticated using (is_active);
create policy "Public delivery settings" on public.delivery_settings
  for select to anon, authenticated using (true);
create index products_catalog_order on public.products (category, sort_order, id) where is_active;
-- Legacy CustomCalendar fallback. No sample products or production prices seeded.
insert into public.delivery_settings (id, max_days) values (1, 14);
