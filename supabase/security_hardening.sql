-- Bayside-Hub security hardening for projects that already applied profiles.sql.
-- Apply once in Supabase Dashboard > SQL Editor after profiles.sql.

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url) on table public.profiles to authenticated;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  if p_role not in ('student', 'advisor', 'admin') then
    raise exception 'Invalid role' using errcode = '23514';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

alter table public.announcements add column if not exists archived_at timestamptz;
drop policy if exists "Anyone can read published announcements" on public.announcements;
create policy "Anyone can read published announcements"
  on public.announcements for select
  using (published = true or archived_at is not null);

-- Safe public projection for approved clubs. The underlying applications table
-- remains private so contact details and submitter IDs are never public.
create or replace view public.approved_clubs
with (security_barrier = true)
as
  select id, club_name, category, description, meeting_days, created_at
  from public.club_applications
  where status = 'approved';

revoke all on public.approved_clubs from public;
grant select on public.approved_clubs to anon, authenticated;

create index if not exists announcements_published_created_idx
  on public.announcements (published, created_at desc);
create index if not exists club_applications_status_created_idx
  on public.club_applications (status, created_at desc);

alter table public.announcements
  drop constraint if exists announcements_content_check,
  add constraint announcements_content_check check (
    char_length(title) between 3 and 120
    and char_length(body) between 3 and 10000
    and tag in ('Announcements', 'Events', 'Clubs', 'Sports', 'Opportunities')
  );

alter table public.club_applications
  drop constraint if exists club_applications_content_check,
  add constraint club_applications_content_check check (
    char_length(club_name) between 3 and 120
    and char_length(description) between 10 and 1000
    and category in ('Arts & Crafts', 'STEM', 'Community Service', 'Publications', 'Sports', 'Music', 'Culture & Language', 'Debate & Government', 'Business', 'Other')
    and (meeting_days is null or char_length(meeting_days) <= 100)
    and (contact_email is null or char_length(contact_email) <= 320)
  );

do $$
begin
  if to_regclass('public.club_interests') is not null then
    execute 'alter table public.club_interests drop constraint if exists club_interests_slug_check, add constraint club_interests_slug_check check (char_length(club_slug) between 1 and 160)';
    execute 'create index if not exists club_interests_slug_idx on public.club_interests (club_slug)';
  end if;
  if to_regclass('public.event_rsvps') is not null then
    execute 'alter table public.event_rsvps drop constraint if exists event_rsvps_event_id_check, add constraint event_rsvps_event_id_check check (char_length(event_id) between 1 and 100)';
    execute 'create index if not exists event_rsvps_event_idx on public.event_rsvps (event_id)';
  end if;
end;
$$;
