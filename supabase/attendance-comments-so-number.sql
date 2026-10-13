-- Standalone Hatchx upgrade: attendance comments and optional SO numbers.
-- Safe to rerun in Supabase SQL Editor after the main schema is installed.
begin;

alter table public.club_attendance_records add column if not exists comments text;
alter table public.club_attendance_records drop constraint if exists club_attendance_records_comments_check;
alter table public.club_attendance_records add constraint club_attendance_records_comments_check
  check (comments is null or char_length(comments) <= 1000);

alter table public.profiles add column if not exists osis_number text;
alter table public.profiles add column if not exists so_number text;
alter table public.profiles drop constraint if exists profiles_so_number_check;
alter table public.profiles add constraint profiles_so_number_check
  check (so_number is null or char_length(btrim(so_number)) between 1 and 50);
grant update (so_number) on table public.profiles to authenticated;

drop function if exists public.check_in_to_club(text);
create or replace function public.check_in_to_club(p_code text, p_comments text default null)
returns table (result text, message text, club_slug text, session_label text)
language plpgsql
security definer set search_path = public
as $$
declare
  target public.club_attendance_sessions%rowtype;
  target_slug text;
  scheduled_start timestamptz;
  scheduled_label text;
  scheduled_slug text;
begin
  if auth.uid() is null then
    return query select 'unauthenticated', 'Sign in before checking in.', null::text, null::text;
    return;
  end if;

  if char_length(coalesce(p_comments, '')) > 1000 then
    return query select 'invalid', 'Comments must be 1,000 characters or fewer.', null::text, null::text;
    return;
  end if;

  select session.* into target
  from public.club_attendance_sessions session
  where upper(session.code) = upper(btrim(p_code))
    and session.active
    and session.starts_at <= now()
    and (session.expires_at is null or session.expires_at > now())
  limit 1;

  if target.id is null then
    select session.starts_at, session.label, club.slug
    into scheduled_start, scheduled_label, scheduled_slug
    from public.club_attendance_sessions session
    join public.clubs club on club.id = session.club_id
    where upper(session.code) = upper(btrim(p_code))
      and session.active
      and session.starts_at > now()
    limit 1;

    if scheduled_start is not null then
      return query select
        'scheduled',
        'Check-in opens at ' || to_char(scheduled_start at time zone 'America/New_York', 'Mon DD at FMHH12:MI AM') || '.',
        scheduled_slug,
        scheduled_label;
    else
      return query select 'invalid', 'That check-in code is invalid or expired.', null::text, null::text;
    end if;
    return;
  end if;

  select club.slug into target_slug from public.clubs club where club.id = target.club_id;
  if not exists (
    select 1 from public.club_memberships membership
    where membership.club_id = target.club_id
      and membership.profile_id = auth.uid()
      and membership.status = 'active'
  ) and not public.can_manage_club(target.club_id) then
    return query select 'not_member', 'Only active members of this Club can check in.', target_slug, target.label;
    return;
  end if;

  insert into public.club_attendance_records (session_id, club_id, profile_id, comments)
  values (target.id, target.club_id, auth.uid(), nullif(btrim(p_comments), ''))
  on conflict (session_id, profile_id) do nothing;

  if found then
    return query select 'checked_in', 'Check-in complete.', target_slug, target.label;
  else
    if nullif(btrim(p_comments), '') is not null then
      update public.club_attendance_records
      set comments = nullif(btrim(p_comments), '')
      where session_id = target.id and profile_id = auth.uid();
    end if;
    return query select 'already_checked_in', 'You are already checked in for this activity.', target_slug, target.label;
  end if;
end;
$$;

revoke all on function public.check_in_to_club(text, text) from public, anon;
grant execute on function public.check_in_to_club(text, text) to authenticated;

drop function if exists public.get_club_attendance_records(uuid, integer);
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
  osis_number text,
  so_number text,
  checked_in_at timestamptz,
  comments text
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
    profile.osis_number,
    profile.so_number,
    record.checked_in_at,
    record.comments
  from public.club_attendance_records record
  join public.club_attendance_sessions session on session.id = record.session_id
  join public.profiles profile on profile.id = record.profile_id
  where record.club_id = p_club_id
  order by record.checked_in_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 2000);
end;
$$;

revoke all on function public.get_club_attendance_records(uuid, integer) from public, anon;
grant execute on function public.get_club_attendance_records(uuid, integer) to authenticated;

commit;
