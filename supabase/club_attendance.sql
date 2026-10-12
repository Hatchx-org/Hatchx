-- Club activity quick check-in with temporary or reusable codes.
-- Apply after club_governance.sql.

create table if not exists public.club_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 3 and 120),
  code text not null check (code ~ '^[A-Z0-9]{8}$'),
  code_type text not null check (code_type in ('temporary', 'permanent')),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (code_type = 'temporary' and expires_at is not null)
    or (code_type = 'permanent' and expires_at is null)
  )
);

create unique index if not exists club_attendance_sessions_code_idx
  on public.club_attendance_sessions (upper(code));
create index if not exists club_attendance_sessions_club_created_idx
  on public.club_attendance_sessions (club_id, created_at desc);

create table if not exists public.club_attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.club_attendance_sessions (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (session_id, profile_id)
);

alter table public.club_attendance_sessions enable row level security;
alter table public.club_attendance_records enable row level security;

drop policy if exists "Managers manage attendance sessions" on public.club_attendance_sessions;
drop policy if exists "Managers read attendance sessions" on public.club_attendance_sessions;
drop policy if exists "Managers create attendance sessions" on public.club_attendance_sessions;
drop policy if exists "Managers update attendance sessions" on public.club_attendance_sessions;
drop policy if exists "Managers delete attendance sessions" on public.club_attendance_sessions;
create policy "Managers read attendance sessions" on public.club_attendance_sessions for select
  using (public.can_manage_club(club_id));
create policy "Managers create attendance sessions" on public.club_attendance_sessions for insert
  with check (public.can_manage_club(club_id) and created_by = auth.uid());
create policy "Managers update attendance sessions" on public.club_attendance_sessions for update
  using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));
create policy "Managers delete attendance sessions" on public.club_attendance_sessions for delete
  using (public.can_manage_club(club_id));

drop policy if exists "Members read own attendance" on public.club_attendance_records;
create policy "Members read own attendance" on public.club_attendance_records for select
  using (profile_id = auth.uid() or public.can_manage_club(club_id));

-- Code redemption is atomic and does not expose active codes to members.
create or replace function public.check_in_to_club(p_code text)
returns table (result text, message text, club_slug text, session_label text)
language plpgsql
security definer set search_path = public
as $$
declare
  target public.club_attendance_sessions%rowtype;
  target_slug text;
begin
  if auth.uid() is null then
    return query select 'unauthenticated', 'Sign in before checking in.', null::text, null::text;
    return;
  end if;

  select s.* into target
  from public.club_attendance_sessions s
  where upper(s.code) = upper(btrim(p_code))
    and s.active
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if target.id is null then
    return query select 'invalid', 'That check-in code is invalid or expired.', null::text, null::text;
    return;
  end if;

  select c.slug into target_slug
  from public.clubs c
  where c.id = target.club_id;

  if not exists (
    select 1 from public.club_memberships m
    where m.club_id = target.club_id and m.profile_id = auth.uid() and m.status = 'active'
  ) and not public.can_manage_club(target.club_id) then
    return query select 'not_member', 'Only active members of this Club can check in.', target_slug, target.label;
    return;
  end if;

  insert into public.club_attendance_records (session_id, club_id, profile_id)
  values (target.id, target.club_id, auth.uid())
  on conflict (session_id, profile_id) do nothing;

  if found then
    return query select 'checked_in', 'Check-in complete.', target_slug, target.label;
  else
    return query select 'already_checked_in', 'You are already checked in for this activity.', target_slug, target.label;
  end if;
end;
$$;

-- Managers can review a minimal roster without receiving member email
-- addresses or unrelated profile fields.
create or replace function public.get_club_attendance_records(
  p_club_id uuid,
  p_limit integer default 1000
)
returns table (
  id uuid,
  session_id uuid,
  session_label text,
  profile_id uuid,
  member_name text,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_manage_club(p_club_id) then
    raise exception 'Club attendance access denied' using errcode = '42501';
  end if;

  return query
  select
    record.id,
    record.session_id,
    session.label,
    record.profile_id,
    coalesce(nullif(profile.full_name, ''), 'Club member'),
    record.checked_in_at
  from public.club_attendance_records record
  join public.club_attendance_sessions session on session.id = record.session_id
  join public.profiles profile on profile.id = record.profile_id
  where record.club_id = p_club_id
  order by record.checked_in_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 2000);
end;
$$;

create or replace function public.get_my_club_attendance(p_limit integer default 20)
returns table (id uuid, session_label text, club_name text, club_slug text, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
  select attendance_row.id, attendance_session.label, club_row.name, club_row.slug, attendance_row.checked_in_at
  from public.club_attendance_records as attendance_row
  join public.club_attendance_sessions as attendance_session on attendance_session.id = attendance_row.session_id
  join public.clubs as club_row on club_row.id = attendance_row.club_id
  where attendance_row.profile_id = auth.uid()
  order by attendance_row.checked_in_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.check_in_to_club(text) from public, anon;
grant execute on function public.check_in_to_club(text) to authenticated;
revoke all on function public.get_club_attendance_records(uuid, integer) from public, anon;
grant execute on function public.get_club_attendance_records(uuid, integer) to authenticated;
revoke all on function public.get_my_club_attendance(integer) from public, anon;
grant execute on function public.get_my_club_attendance(integer) to authenticated;
