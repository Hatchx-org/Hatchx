-- Schedule Quick Attendance codes before an activity begins.
-- Run after club_attendance.sql.
begin;

alter table public.club_attendance_sessions add column if not exists starts_at timestamptz;
update public.club_attendance_sessions set starts_at=created_at where starts_at is null;
alter table public.club_attendance_sessions alter column starts_at set default now();
alter table public.club_attendance_sessions alter column starts_at set not null;
alter table public.club_attendance_sessions drop constraint if exists club_attendance_schedule_check;
alter table public.club_attendance_sessions add constraint club_attendance_schedule_check
  check (expires_at is null or expires_at > starts_at);
create index if not exists club_attendance_sessions_schedule_idx
  on public.club_attendance_sessions(starts_at,expires_at) where active;

create or replace function public.check_in_to_club(p_code text)
returns table (result text, message text, club_slug text, session_label text)
language plpgsql security definer set search_path=public as $$
declare target public.club_attendance_sessions%rowtype; target_slug text; scheduled_start timestamptz; scheduled_label text; scheduled_slug text;
begin
  if auth.uid() is null then
    return query select 'unauthenticated','Sign in before checking in.',null::text,null::text; return;
  end if;

  select s.* into target from public.club_attendance_sessions s
  where upper(s.code)=upper(btrim(p_code)) and s.active and s.starts_at<=now()
    and (s.expires_at is null or s.expires_at>now()) limit 1;

  if target.id is null then
    select s.starts_at,s.label,c.slug into scheduled_start,scheduled_label,scheduled_slug from public.club_attendance_sessions s
    join public.clubs c on c.id=s.club_id
    where upper(s.code)=upper(btrim(p_code)) and s.active and s.starts_at>now() limit 1;
    if scheduled_start is not null then
      return query select 'scheduled','Check-in opens at '||to_char(scheduled_start at time zone 'America/New_York','Mon DD at FMHH12:MI AM')||'.',scheduled_slug,scheduled_label;
    else
      return query select 'invalid','That check-in code is invalid or expired.',null::text,null::text;
    end if;
    return;
  end if;

  select c.slug into target_slug from public.clubs c where c.id=target.club_id;
  if not exists(select 1 from public.club_memberships m where m.club_id=target.club_id and m.profile_id=auth.uid() and m.status='active')
     and not public.can_manage_club(target.club_id) then
    return query select 'not_member','Only active members of this Club can check in.',target_slug,target.label; return;
  end if;

  insert into public.club_attendance_records(session_id,club_id,profile_id)
  values(target.id,target.club_id,auth.uid()) on conflict(session_id,profile_id) do nothing;
  if found then
    return query select 'checked_in','Check-in complete.',target_slug,target.label;
  else
    return query select 'already_checked_in','You are already checked in for this activity.',target_slug,target.label;
  end if;
end $$;
revoke all on function public.check_in_to_club(text) from public,anon;
grant execute on function public.check_in_to_club(text) to authenticated;

commit;
