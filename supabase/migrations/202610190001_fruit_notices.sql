-- A notice belongs to a fruit group, independently of product weight/content.
create table public.fruit_notices (
  fruit_type text primary key check (length(btrim(fruit_type)) between 1 and 80),
  notice text not null check (length(notice) <= 500)
);
alter table public.fruit_notices enable row level security;
grant select on public.fruit_notices to anon, authenticated;
create policy "Public fruit notices" on public.fruit_notices
  for select to anon, authenticated using (true);

create function public.save_fruit_notice(p_fruit text, p_notice text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_actor);
  if p_fruit is null or length(btrim(p_fruit)) not between 1 and 80
    or p_notice is null or length(btrim(p_notice)) > 500 then
    raise exception '과일과 안내사항을 확인해주세요.';
  end if;
  if not exists(select 1 from public.products
    where category='product' and fruit_type=btrim(p_fruit) and not is_deleted) then
    raise exception '과일 목록이 변경되었습니다. 새로고침해주세요.';
  end if;
  if btrim(p_notice) = '' then
    delete from public.fruit_notices where fruit_type=btrim(p_fruit);
  else
    insert into public.fruit_notices(fruit_type, notice)
    values(btrim(p_fruit), btrim(p_notice))
    on conflict (fruit_type) do update set notice=excluded.notice;
  end if;
end $$;
revoke all on function public.save_fruit_notice(text,text,uuid) from public, anon, authenticated;
grant execute on function public.save_fruit_notice(text,text,uuid) to service_role;
grant select on public.fruit_notices to service_role;
