-- Student registration details and Club invitation codes.
-- Apply after core_platform.sql and custom_permissions.sql.
begin;

alter table public.profiles add column if not exists osis_number text;
alter table public.profiles add column if not exists grade_level smallint;
alter table public.profiles drop constraint if exists profiles_grade_level_check;
alter table public.profiles add constraint profiles_grade_level_check check (grade_level is null or grade_level between 9 and 12);
alter table public.profiles drop constraint if exists profiles_osis_number_check;
alter table public.profiles add constraint profiles_osis_number_check check (osis_number is null or osis_number ~ '^\d{9}$');
create unique index if not exists profiles_osis_number_unique on public.profiles(osis_number) where osis_number is not null;

create table if not exists public.club_invite_codes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9-]{6,32}$'),
  label text not null check (char_length(btrim(label)) between 3 and 100),
  expires_at timestamptz,
  max_uses integer check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check (max_uses is null or use_count <= max_uses)
);

create table if not exists public.club_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.club_invite_codes(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(invite_id, profile_id)
);

create index if not exists club_invite_codes_club_created_idx on public.club_invite_codes(club_id, created_at desc);
alter table public.club_invite_codes enable row level security;
alter table public.club_invite_redemptions enable row level security;

drop policy if exists "Managers read Club invite codes" on public.club_invite_codes;
drop policy if exists "Managers create Club invite codes" on public.club_invite_codes;
drop policy if exists "Managers update Club invite codes" on public.club_invite_codes;
create policy "Managers read Club invite codes" on public.club_invite_codes for select using(public.can_manage_club(club_id));
create policy "Managers create Club invite codes" on public.club_invite_codes for insert with check(public.can_manage_club(club_id) and created_by=auth.uid());
create policy "Managers update Club invite codes" on public.club_invite_codes for update using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
grant select,insert,update on public.club_invite_codes to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  mapped_role text := 'student';
  student_account boolean;
  supplied_osis text;
  supplied_grade smallint;
  invite_value text;
  invite_row public.club_invite_codes%rowtype;
begin
  student_account := lower(coalesce(new.email, '')) like '%@nycstudents.net';
  if lower(coalesce(new.email, '')) like '%@school.doe.gov'
     or lower(coalesce(new.email, '')) like '%@schools.nyc.gov' then
    mapped_role := 'advisor';
  end if;

  if student_account then
    supplied_osis := new.raw_user_meta_data ->> 'osis_number';
    supplied_grade := nullif(new.raw_user_meta_data ->> 'grade_level', '')::smallint;
    if supplied_osis is null or supplied_osis !~ '^\d{9}$' or supplied_grade not between 9 and 12 then
      raise exception 'Student OSIS and grade are required' using errcode='23514';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role, osis_number, grade_level)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    mapped_role,
    case when student_account then supplied_osis else null end,
    case when student_account then supplied_grade else null end
  )
  on conflict (id) do nothing;

  if jsonb_typeof(new.raw_user_meta_data -> 'invite_codes') = 'array' then
    for invite_value in select distinct upper(btrim(value)) from jsonb_array_elements_text(new.raw_user_meta_data -> 'invite_codes') value limit 8 loop
      select * into invite_row from public.club_invite_codes
      where code=invite_value and active and (expires_at is null or expires_at>now()) and (max_uses is null or use_count<max_uses)
      for update skip locked;
      if found then
        insert into public.club_memberships(club_id, profile_id, status, reviewed_at)
        values(invite_row.club_id, new.id, 'active', now())
        on conflict (club_id, profile_id) do update set status='active', reviewed_at=now(), ended_at=null;
        insert into public.club_invite_redemptions(invite_id, club_id, profile_id)
        values(invite_row.id, invite_row.club_id, new.id)
        on conflict do nothing;
        if found then update public.club_invite_codes set use_count=use_count+1 where id=invite_row.id; end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

commit;
