begin;
create table public.pos_receipts (
  checkout_id uuid primary key references public.checkouts(id),
  receipt_date date not null,
  receipt_number integer not null check(receipt_number > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create index pos_receipts_day_number on public.pos_receipts(receipt_date,receipt_number);
alter table public.pos_receipts enable row level security;
revoke all on public.pos_receipts from public,anon,authenticated;

create function public.manage_pos_receipt(p_id uuid,p_actor uuid,p_number integer default null,p_expected integer default null,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.checkouts; current_number integer; day date; duplicates jsonb;
begin
  perform private.assert_staff(p_actor);
  select * into strict c from public.checkouts where id=p_id for update;
  if c.paid_at is null then raise exception '결제 완료 후 영수증번호를 입력해주세요.'; end if;
  day := (c.paid_at at time zone 'Asia/Seoul')::date;
  perform pg_advisory_xact_lock(hashtextextended('pos-receipt:'||day::text,0));
  select receipt_number into current_number from public.pos_receipts where checkout_id=p_id;
  if p_number is null then
    return jsonb_build_object('date',day,'number',current_number);
  end if;
  if p_number < 1 then raise exception '영수증번호는 1 이상이어야 합니다.'; end if;
  if c.status <> 'paid' then raise exception '결제 완료 주문만 영수증번호를 변경할 수 있습니다.'; end if;
  if current_number = p_number then return jsonb_build_object('saved',true,'date',day,'number',current_number); end if;
  if current_number is distinct from p_expected then raise exception '다른 관리자가 영수증번호를 변경했습니다. 창을 닫고 다시 열어주세요.'; end if;
  select coalesce(jsonb_agg(o.order_number order by o.order_number),'[]'::jsonb) into duplicates
  from public.pos_receipts r join public.checkouts o on o.id=r.checkout_id
  where r.receipt_date=day and r.receipt_number=p_number and r.checkout_id<>p_id;
  if jsonb_array_length(duplicates)>0 and not p_allow_duplicate then
    return jsonb_build_object('saved',false,'duplicates',duplicates);
  end if;
  insert into public.pos_receipts(checkout_id,receipt_date,receipt_number,updated_by)
    values(p_id,day,p_number,p_actor)
    on conflict(checkout_id) do update set receipt_number=excluded.receipt_number,updated_by=p_actor,updated_at=now();
  insert into public.staff_events(actor,action,target_id) values(p_actor,'pos_receipt',p_id);
  return jsonb_build_object('saved',true,'date',day,'number',p_number);
end $$;
revoke all on function public.manage_pos_receipt(uuid,uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.manage_pos_receipt(uuid,uuid,integer,integer,boolean) to service_role;
commit;
