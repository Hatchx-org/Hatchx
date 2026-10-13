-- Complete Hatchx schema for a brand-new Supabase project.
-- Run this file once in Supabase SQL Editor. Existing databases must use
-- upgrade-existing.sql instead.
-- SQL contains no website hostname; configure the new domain in Vercel and
-- Supabase Authentication > URL Configuration.

-- ============================================================================
-- 01. profiles.sql
-- ============================================================================

-- Bayside-Hub: profiles + role-based access control
-- Apply in Supabase Dashboard > SQL Editor (one-time).
-- After applying, promote yourself: UPDATE public.profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';

-- 1. Profiles table (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'advisor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Keep updated_at fresh (optional)
create or replace function public.handle_profile_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute function public.handle_profile_updated();

-- 4. Row Level Security
alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Non-recursive admin check: SECURITY DEFINER bypasses RLS on profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin',
    false
  );
$$;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Admins can manage all profiles" on public.profiles;
create policy "Admins can manage all profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Do not let a signed-in user update protected columns (especially `role`).
-- Admin role changes go through the guarded SECURITY DEFINER function below.
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

-- ============================================================================
-- 02. admin_crud.sql
-- ============================================================================

-- Bayside-Hub: admin CRUD (announcements + club applications)
-- Apply in Supabase Dashboard > SQL Editor (one-time), AFTER profiles.sql.

-- 0. Admin helper used by every policy below
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 1. Announcements (public reads, admins write)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text not null default 'Announcements',
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  published boolean not null default true
);

alter table public.announcements add column if not exists archived_at timestamptz;

alter table public.announcements enable row level security;

alter table public.announcements
  drop constraint if exists announcements_content_check,
  add constraint announcements_content_check check (
    char_length(title) between 3 and 120
    and char_length(body) between 3 and 10000
    and tag in ('Announcements', 'Events', 'Clubs', 'Sports', 'Opportunities')
  );

create index if not exists announcements_published_created_idx
  on public.announcements (published, created_at desc);

drop policy if exists "Anyone can read published announcements" on public.announcements;
create policy "Anyone can read published announcements"
  on public.announcements for select
  using (published = true or archived_at is not null);

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements"
  on public.announcements for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Club applications (students apply, admins review)
create table if not exists public.club_applications (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  category text not null default 'Other',
  description text not null,
  meeting_days text,
  contact_email text,
  submitted_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);

alter table public.club_applications enable row level security;

alter table public.club_applications
  drop constraint if exists club_applications_content_check,
  add constraint club_applications_content_check check (
    char_length(club_name) between 3 and 120
    and char_length(description) between 10 and 1000
    and category in ('Arts & Crafts', 'STEM', 'Community Service', 'Publications', 'Sports', 'Music', 'Culture & Language', 'Debate & Government', 'Business', 'Other')
    and (meeting_days is null or char_length(meeting_days) <= 100)
    and (contact_email is null or char_length(contact_email) <= 320)
  );

create index if not exists club_applications_status_created_idx
  on public.club_applications (status, created_at desc);

drop policy if exists "Members can submit applications" on public.club_applications;
create policy "Members can submit applications"
  on public.club_applications for insert
  with check (auth.uid() = submitted_by);

drop policy if exists "Members can view own applications" on public.club_applications;
create policy "Members can view own applications"
  on public.club_applications for select
  using (auth.uid() = submitted_by);

drop policy if exists "Admins review applications" on public.club_applications;
create policy "Admins review applications"
  on public.club_applications for all
  using (public.is_admin())
  with check (public.is_admin());

-- Public directory view: expose approved club content without applicant identity/contact fields.
create or replace view public.approved_clubs
with (security_barrier = true)
as
  select id, club_name, category, description, meeting_days, created_at
  from public.club_applications
  where status = 'approved';

revoke all on public.approved_clubs from public;
grant select on public.approved_clubs to anon, authenticated;

-- 3. Seed a few pending applications so the admin queue isn't empty on day one
insert into public.club_applications (club_name, category, description, meeting_days, contact_email)
select * from (values
  ('Crochet Club', 'Arts & Crafts', 'Charter review needed for new club sign-up.', 'Thu, Fri', 'crochet@bayside-school.org'),
  ('STEM Fair Committee', 'STEM', 'Event approval for the Spring STEM Fair.', 'Tue', 'stemfair@bayside-school.org'),
  ('Key Club Officer Change', 'Community Service', 'Officer roster update for existing club.', 'Mon', 'keyclub@bayside-school.org')
) as seed(club_name, category, description, meeting_days, contact_email)
where not exists (select 1 from public.club_applications);

-- ============================================================================
-- 03. member_actions.sql
-- ============================================================================

-- Bayside-Hub: member engagement (club interests + event RSVPs)
-- Apply in Supabase Dashboard > SQL Editor (one-time), AFTER profiles.sql and admin_crud.sql.

-- 1. Club interests ("I'm interested" on a club page)
create table if not exists public.club_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, club_slug)
);

alter table public.club_interests enable row level security;

alter table public.club_interests
  drop constraint if exists club_interests_slug_check,
  add constraint club_interests_slug_check check (char_length(club_slug) between 1 and 160);

create index if not exists club_interests_slug_idx on public.club_interests (club_slug);

drop policy if exists "Members manage own club interests" on public.club_interests;
create policy "Members manage own club interests"
  on public.club_interests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public count without exposing who is interested
create or replace function public.club_interest_count(p_slug text)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select count(*) from public.club_interests where club_slug = p_slug;
$$;

-- 2. Event RSVPs ("I'm going" on an event page)
create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.event_rsvps enable row level security;

alter table public.event_rsvps
  drop constraint if exists event_rsvps_event_id_check,
  add constraint event_rsvps_event_id_check check (char_length(event_id) between 1 and 100);

create index if not exists event_rsvps_event_idx on public.event_rsvps (event_id);

drop policy if exists "Members manage own event rsvps" on public.event_rsvps;
create policy "Members manage own event rsvps"
  on public.event_rsvps for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.event_rsvp_count(p_event_id text)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select count(*) from public.event_rsvps where event_id = p_event_id;
$$;

revoke all on function public.club_interest_count(text) from public;
revoke all on function public.event_rsvp_count(text) from public;
grant execute on function public.club_interest_count(text) to anon, authenticated;
grant execute on function public.event_rsvp_count(text) to anon, authenticated;

-- ============================================================================
-- 04. security_hardening.sql
-- ============================================================================

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

-- ============================================================================
-- 05. core_platform.sql
-- ============================================================================

-- Bayside-Hub core platform schema
-- Apply after profiles.sql, admin_crud.sql, member_actions.sql, and security_hardening.sql.
-- This migration is intentionally additive so existing deployments keep working.

-- ---------------------------------------------------------------------------
-- Roles and authorization helpers
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'advisor', 'staff', 'admin'));

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff', 'admin')
  );
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_role not in ('student', 'advisor', 'staff', 'admin') then
    raise exception 'Invalid role' using errcode = '23514';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Student/advisor role mapping happens only when the profile is first created.
-- Staff and admin roles always require explicit admin elevation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  mapped_role text := 'student';
begin
  if lower(coalesce(new.email, '')) like '%@school.doe.gov'
     or lower(coalesce(new.email, '')) like '%@schools.nyc.gov' then
    mapped_role := 'advisor';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    mapped_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

update public.profiles
set role = 'advisor'
where role = 'student'
  and (
    lower(email) like '%@school.doe.gov'
    or lower(email) like '%@schools.nyc.gov'
  );

-- ---------------------------------------------------------------------------
-- Clubs and membership
-- ---------------------------------------------------------------------------

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null,
  interest_tags text[] not null default '{}',
  is_stem boolean not null default false,
  is_community_service boolean not null default false,
  active_start_date date,
  active_end_date date,
  google_classroom_code text,
  contact_email text,
  join_policy text not null default 'approval_required'
    check (join_policy in ('instant', 'approval_required')),
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_officers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text,
  title text not null,
  term_start date,
  term_end date,
  created_at timestamptz not null default now(),
  check (profile_id is not null or nullif(trim(display_name), '') is not null)
);

create table if not exists public.club_advisors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  display_name text,
  contact_email text,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

alter table public.club_advisors add column if not exists display_name text;
alter table public.club_advisors add column if not exists contact_email text;

create table if not exists public.club_meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time,
  end_time time,
  location text,
  recurrence_note text,
  created_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'left')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  unique (club_id, profile_id)
);

create table if not exists public.club_media (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'document')),
  storage_path text not null,
  title text,
  alt_text text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null,
  body text not null,
  published boolean not null default true,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.can_manage_club(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_staff_or_admin() or exists (
    select 1 from public.club_advisors a
    where a.club_id = p_club_id and a.profile_id = auth.uid()
  );
$$;

create or replace function public.can_view_member_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_staff_or_admin() or exists (
    select 1
    from public.club_memberships m
    join public.club_advisors a on a.club_id = m.club_id
    where m.profile_id = p_profile_id and a.profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Announcement history
-- ---------------------------------------------------------------------------

alter table public.announcements add column if not exists effective_date date default current_date;
alter table public.announcements add column if not exists updated_at timestamptz not null default now();
alter table public.announcements add column if not exists updated_by uuid references public.profiles (id) on delete set null;
alter table public.announcements add column if not exists version_note text;

create table if not exists public.announcement_versions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  version_number integer not null,
  snapshot_title text not null,
  snapshot_content text not null,
  snapshot_tag text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  version_note text,
  unique (announcement_id, version_number)
);

create or replace function public.capture_announcement_version()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_version integer;
begin
  if tg_op = 'UPDATE' and row(new.title, new.body, new.tag, new.published, new.archived_at)
      is not distinct from row(old.title, old.body, old.tag, old.published, old.archived_at) then
    return new;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.announcement_versions
  where announcement_id = new.id;

  insert into public.announcement_versions (
    announcement_id, version_number, snapshot_title, snapshot_content,
    snapshot_tag, changed_by, version_note
  ) values (
    new.id, next_version, new.title, new.body, new.tag,
    coalesce(new.updated_by, new.created_by), new.version_note
  );
  return new;
end;
$$;

drop trigger if exists announcement_version_history on public.announcements;
create trigger announcement_version_history
  after insert or update on public.announcements
  for each row execute function public.capture_announcement_version();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists announcements_touch_updated_at on public.announcements;
create trigger announcements_touch_updated_at before update on public.announcements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Events, opportunities, and support
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  event_type text not null default 'other'
    check (event_type in ('school', 'club', 'sports', 'festival', 'other')),
  club_id uuid references public.clubs (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  price_label text not null default 'Free',
  published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null
    check (category in ('election', 'community_service', 'internship', 'pre_college', 'scholarship', 'discount')),
  description text not null,
  eligibility text,
  application_link text,
  deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'expired', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null
    check (request_type in ('technical', 'club_support', 'room_reservation', 'funding', 'fundraising_finance', 'charter')),
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'closed')),
  subject text not null,
  details text not null,
  requested_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_request_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.club_officers enable row level security;
alter table public.club_advisors enable row level security;
alter table public.club_meetings enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_media enable row level security;
alter table public.club_announcements enable row level security;
alter table public.announcement_versions enable row level security;
alter table public.events enable row level security;
alter table public.opportunities enable row level security;
alter table public.support_requests enable row level security;
alter table public.support_request_updates enable row level security;

drop policy if exists "Staff view profiles" on public.profiles;
create policy "Staff view profiles" on public.profiles for select using (public.is_staff_or_admin());
drop policy if exists "Club managers view member profiles" on public.profiles;
create policy "Club managers view member profiles" on public.profiles for select using (public.can_view_member_profile(id));

drop policy if exists "Public reads published clubs" on public.clubs;
drop policy if exists "Managers manage clubs" on public.clubs;
drop policy if exists "Public reads club officers" on public.club_officers;
drop policy if exists "Managers manage club officers" on public.club_officers;
drop policy if exists "Public reads club advisors" on public.club_advisors;
drop policy if exists "Managers manage club advisors" on public.club_advisors;
drop policy if exists "Public reads club meetings" on public.club_meetings;
drop policy if exists "Managers manage club meetings" on public.club_meetings;
drop policy if exists "Public reads club media" on public.club_media;
drop policy if exists "Managers manage club media" on public.club_media;
drop policy if exists "Public reads club announcements" on public.club_announcements;
drop policy if exists "Managers manage club announcements" on public.club_announcements;
drop policy if exists "Members read own membership" on public.club_memberships;
drop policy if exists "Members request membership" on public.club_memberships;
drop policy if exists "Members leave clubs" on public.club_memberships;
drop policy if exists "Members remove own membership" on public.club_memberships;
drop policy if exists "Managers review membership" on public.club_memberships;
drop policy if exists "Public reads announcement history" on public.announcement_versions;
drop policy if exists "Staff manage announcement history" on public.announcement_versions;
drop policy if exists "Public reads published events" on public.events;
drop policy if exists "Staff and club managers manage events" on public.events;
drop policy if exists "Public reads published opportunities" on public.opportunities;
drop policy if exists "Staff manage opportunities" on public.opportunities;
drop policy if exists "Requesters read own support requests" on public.support_requests;
drop policy if exists "Members create support requests" on public.support_requests;
drop policy if exists "Staff manage support requests" on public.support_requests;
drop policy if exists "Participants read support updates" on public.support_request_updates;
drop policy if exists "Participants add support updates" on public.support_request_updates;

create policy "Public reads published clubs" on public.clubs for select using (status = 'published' or public.can_manage_club(id));
create policy "Managers manage clubs" on public.clubs for all using (public.can_manage_club(id)) with check (public.is_staff_or_admin() or public.can_manage_club(id));

create policy "Public reads club officers" on public.club_officers for select using (exists (select 1 from public.clubs c where c.id = club_id and c.status = 'published'));
create policy "Managers manage club officers" on public.club_officers for all using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));
create policy "Public reads club advisors" on public.club_advisors for select using (exists (select 1 from public.clubs c where c.id = club_id and c.status = 'published'));
create policy "Managers manage club advisors" on public.club_advisors for all using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));
create policy "Public reads club meetings" on public.club_meetings for select using (exists (select 1 from public.clubs c where c.id = club_id and c.status = 'published'));
create policy "Managers manage club meetings" on public.club_meetings for all using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));
create policy "Public reads club media" on public.club_media for select using (exists (select 1 from public.clubs c where c.id = club_id and c.status = 'published'));
create policy "Managers manage club media" on public.club_media for all using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));
create policy "Public reads club announcements" on public.club_announcements for select using (published = true);
create policy "Managers manage club announcements" on public.club_announcements for all using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy "Members read own membership" on public.club_memberships for select using (profile_id = auth.uid() or public.can_manage_club(club_id));
create policy "Members request membership" on public.club_memberships for insert with check (
  profile_id = auth.uid()
  and status = (
    select case when c.join_policy = 'instant' then 'active' else 'pending' end
    from public.clubs c where c.id = club_id and c.status = 'published'
  )
);
create policy "Members leave clubs" on public.club_memberships for update using (profile_id = auth.uid()) with check (profile_id = auth.uid() and status = 'left');
create policy "Members remove own membership" on public.club_memberships for delete using (profile_id = auth.uid());
create policy "Managers review membership" on public.club_memberships for update using (public.can_manage_club(club_id)) with check (public.can_manage_club(club_id));

create policy "Public reads announcement history" on public.announcement_versions for select using (
  exists (select 1 from public.announcements a where a.id = announcement_id and (a.published or a.archived_at is not null))
);
create policy "Staff manage announcement history" on public.announcement_versions for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "Public reads published events" on public.events for select using (published = true);
create policy "Staff and club managers manage events" on public.events for all
  using (public.is_staff_or_admin() or (club_id is not null and public.can_manage_club(club_id)))
  with check (public.is_staff_or_admin() or (club_id is not null and public.can_manage_club(club_id)));
create policy "Public reads published opportunities" on public.opportunities for select using (status = 'published');
create policy "Staff manage opportunities" on public.opportunities for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "Requesters read own support requests" on public.support_requests for select using (submitted_by = auth.uid() or public.is_staff_or_admin());
create policy "Members create support requests" on public.support_requests for insert with check (submitted_by = auth.uid());
create policy "Staff manage support requests" on public.support_requests for update using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy "Participants read support updates" on public.support_request_updates for select using (
  exists (select 1 from public.support_requests r where r.id = request_id and (r.submitted_by = auth.uid() or public.is_staff_or_admin()))
  and (internal = false or public.is_staff_or_admin())
);
create policy "Participants add support updates" on public.support_request_updates for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.support_requests r where r.id = request_id and (r.submitted_by = auth.uid() or public.is_staff_or_admin())
  )
);

-- Existing announcement administration now includes staff, while role changes stay admin-only.
drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists "Staff manage announcements" on public.announcements;
create policy "Staff manage announcements" on public.announcements for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists "Admins review applications" on public.club_applications;
drop policy if exists "Staff review applications" on public.club_applications;
create policy "Staff review applications" on public.club_applications for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- ---------------------------------------------------------------------------
-- Promote approved applications into the canonical clubs table
-- ---------------------------------------------------------------------------

create or replace function public.promote_approved_club_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_slug text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    base_slug := trim(both '-' from regexp_replace(lower(new.club_name), '[^a-z0-9]+', '-', 'g'));
    insert into public.clubs (
      slug, name, short_description, interest_tags, is_stem,
      is_community_service, contact_email, created_by
    ) values (
      case when exists (select 1 from public.clubs where slug = base_slug)
        then base_slug || '-' || left(new.id::text, 8)
        else base_slug
      end, new.club_name, new.description,
      array[new.category], new.category = 'STEM', new.category = 'Community Service',
      new.contact_email, new.submitted_by
    ) on conflict (slug) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists approved_application_creates_club on public.club_applications;
create trigger approved_application_creates_club
  after insert or update of status on public.club_applications
  for each row execute function public.promote_approved_club_application();

insert into public.clubs (
  slug, name, short_description, interest_tags, is_stem,
  is_community_service, contact_email, created_by
)
select
  trim(both '-' from regexp_replace(lower(a.club_name), '[^a-z0-9]+', '-', 'g')) || '-' || left(a.id::text, 8),
  a.club_name, a.description, array[a.category], a.category = 'STEM',
  a.category = 'Community Service', a.contact_email, a.submitted_by
from public.club_applications a
where a.status = 'approved'
on conflict (slug) do nothing;

create index if not exists clubs_status_name_idx on public.clubs (status, name);
create index if not exists club_memberships_profile_status_idx on public.club_memberships (profile_id, status);
create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists opportunities_status_deadline_idx on public.opportunities (status, deadline);
create index if not exists support_requests_submitter_created_idx on public.support_requests (submitted_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Starter content (safe to re-run; existing records win)
-- ---------------------------------------------------------------------------

insert into public.clubs (
  slug, name, short_description, interest_tags, is_stem, is_community_service,
  active_start_date, active_end_date, join_policy
)
values
  ('key-club', 'Key Club', 'Student-led service, leadership, and community projects.', array['Community Service'], false, true, current_date, current_date + 365, 'instant'),
  ('crochet-club', 'Crochet Club', 'Learn crochet, share projects, and build a welcoming fiber-arts community.', array['Arts & Crafts'], false, false, current_date, current_date + 365, 'instant'),
  ('robotics', 'Robotics Club', 'Design, build, and program robots for collaborative competitions.', array['STEM'], true, false, current_date, current_date + 365, 'approval_required'),
  ('debate-team', 'Debate Team', 'Develop research, public speaking, and argumentation skills.', array['Debate & Government'], false, false, current_date, current_date + 365, 'approval_required'),
  ('school-newspaper', 'School Newspaper', 'Write, edit, photograph, and design the student newspaper.', array['Publications'], false, false, current_date, current_date + 365, 'approval_required'),
  ('environmental', 'Environmental Club', 'Lead recycling, cleanup, and environmental awareness projects.', array['Community Service'], false, true, current_date, current_date + 365, 'instant'),
  ('health-occupations', 'Health Occupations Students of America', 'Explore healthcare careers through competitions and community projects.', array['STEM'], true, true, current_date, current_date + 365, 'approval_required'),
  ('art-club', 'Art Club', 'Create, critique, and exhibit art in a supportive community.', array['Arts & Crafts'], false, false, current_date, current_date + 365, 'instant')
on conflict (slug) do nothing;

insert into public.club_meetings (club_id, day_of_week, start_time, end_time, location, recurrence_note)
select c.id, seed.day_of_week, seed.start_time::time, seed.end_time::time, seed.location, seed.recurrence_note
from (values
  ('key-club', 1, '15:00', '16:00', 'Room 219', 'Every Monday'),
  ('crochet-club', 4, '15:15', '16:15', 'Room 112', 'Every Thursday'),
  ('robotics', 2, '15:00', '17:00', 'Robotics Lab (Room 305)', 'Every Tuesday'),
  ('debate-team', 3, '15:15', '16:30', 'Room 402', 'Every Wednesday'),
  ('school-newspaper', 1, '15:00', '16:00', 'Room 218', 'Every Monday'),
  ('environmental', 5, '15:00', '16:00', 'Room 108', 'Every Friday'),
  ('health-occupations', 2, '15:15', '16:15', 'Room 221', 'Every Tuesday'),
  ('art-club', 4, '15:00', '16:30', 'Art Studio (Room 130)', 'Every Thursday')
) as seed(slug, day_of_week, start_time, end_time, location, recurrence_note)
join public.clubs c on c.slug = seed.slug
where not exists (select 1 from public.club_meetings m where m.club_id = c.id);

insert into public.events (title, description, event_type, start_at, end_at, location, price_label)
select seed.title, seed.description, seed.event_type, seed.start_at, seed.end_at, seed.location, seed.price_label
from (values
  ('Welcome Back Assembly', 'Start the term with school updates and student organization highlights.', 'school', now() + interval '7 days', now() + interval '7 days 2 hours', 'Auditorium', 'Free'),
  ('Fall Club Fair', 'Meet club officers and discover ways to get involved.', 'school', now() + interval '14 days', now() + interval '14 days 3 hours', 'Cafeteria', 'Free'),
  ('Girls Volleyball Tryouts', 'Open tryouts for the upcoming volleyball season.', 'sports', now() + interval '21 days', now() + interval '21 days 2 hours', 'Gymnasium A', 'Free'),
  ('Boys Basketball Tryouts', 'Open tryouts for the upcoming basketball season.', 'sports', now() + interval '24 days', now() + interval '24 days 2 hours', 'Gymnasium B', 'Free'),
  ('Multicultural Festival', 'Celebrate the cultures and communities represented at Bayside.', 'festival', now() + interval '35 days', now() + interval '35 days 4 hours', 'Courtyard', 'Free'),
  ('College Planning Night', 'Families can meet counselors and learn about the college process.', 'school', now() + interval '42 days', now() + interval '42 days 2 hours', 'Auditorium', 'Free'),
  ('Community Service Day', 'Join school-wide volunteer projects with local partners.', 'school', now() + interval '49 days', now() + interval '49 days 5 hours', 'Main Entrance', 'Free'),
  ('Winter Concert', 'Seasonal performances from band, orchestra, and chorus.', 'school', now() + interval '70 days', now() + interval '70 days 2 hours', 'Auditorium', 'Free'),
  ('Spring Carnival', 'Games, performances, and student organization booths.', 'festival', now() + interval '180 days', now() + interval '180 days 4 hours', 'School Field', 'Free')
) as seed(title, description, event_type, start_at, end_at, location, price_label)
where not exists (select 1 from public.events e where e.title = seed.title);

insert into public.opportunities (title, category, description, eligibility, application_link, deadline, status)
select seed.title, seed.category, seed.description, seed.eligibility, seed.application_link, seed.deadline, 'published'
from (values
  ('Student Council Elections', 'election', 'Run for a student council position and represent your peers.', 'Current Bayside students in good standing.', null, now() + interval '30 days'),
  ('SYEP Summer Youth Employment', 'internship', 'Apply for paid summer work through New York City.', 'See the official program requirements.', 'https://application.nycsyep.com/', now() + interval '90 days'),
  ('CUNY College Now', 'pre_college', 'Take eligible college courses while attending high school.', 'Eligibility varies by course and partner campus.', 'https://k16.cuny.edu/collegenow/', now() + interval '60 days'),
  ('Community Food Drive', 'community_service', 'Collect and sort donations for local food pantries.', 'Open to all Bayside students.', null, now() + interval '21 days'),
  ('Bayside Student Arts Discount', 'discount', 'Present a valid student ID for participating local arts discounts.', 'Current Bayside student ID required.', null, now() + interval '180 days')
) as seed(title, category, description, eligibility, application_link, deadline)
where not exists (select 1 from public.opportunities o where o.title = seed.title);

-- ============================================================================
-- 06. performance_indexes.sql
-- ============================================================================

-- Query indexes for the production access patterns used by Hatchx.
-- Safe to run repeatedly after core_platform.sql.

create index if not exists events_published_start_idx
  on public.events (published, start_at);

create index if not exists announcements_public_feed_idx
  on public.announcements (published, archived_at, created_at desc);

create index if not exists club_meetings_club_day_idx
  on public.club_meetings (club_id, day_of_week);

create index if not exists club_applications_submitter_status_idx
  on public.club_applications (submitted_by, status, created_at desc);

create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);

-- ============================================================================
-- 07. club_governance.sql
-- ============================================================================

-- Club-specific board access, public media, and audit history.
-- Apply after core_platform.sql.

-- Governors make personnel/membership decisions. Content managers additionally
-- include active officers, whose authority remains scoped to a single club.
create or replace function public.can_govern_club(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_staff_or_admin() or exists (
    select 1 from public.club_advisors a
    where a.club_id = p_club_id and a.profile_id = auth.uid()
  );
$$;

create or replace function public.can_manage_club(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.can_govern_club(p_club_id) or exists (
    select 1 from public.club_officers o
    where o.club_id = p_club_id
      and o.profile_id = auth.uid()
      and (o.term_start is null or o.term_start <= current_date)
      and (o.term_end is null or o.term_end >= current_date)
  );
$$;

drop policy if exists "Managers manage club officers" on public.club_officers;
drop policy if exists "Governors manage club officers" on public.club_officers;
create policy "Governors manage club officers" on public.club_officers for all
  using (public.can_govern_club(club_id))
  with check (public.can_govern_club(club_id));

drop policy if exists "Managers manage club advisors" on public.club_advisors;
drop policy if exists "Staff manage club advisors" on public.club_advisors;
create policy "Staff manage club advisors" on public.club_advisors for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "Managers review membership" on public.club_memberships;
drop policy if exists "Governors review membership" on public.club_memberships;
create policy "Governors review membership" on public.club_memberships for update
  using (public.can_govern_club(club_id))
  with check (public.can_govern_club(club_id));

create table if not exists public.club_audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.club_compliance (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  school_year text not null check (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  roster_count integer not null default 0 check (roster_count between 0 and 10000),
  constitution_on_file boolean not null default false,
  college_alignment_on_file boolean not null default false,
  annual_event_completed boolean not null default false,
  community_service_completed boolean not null default false,
  fundraiser_completed boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (club_id, school_year)
);

alter table public.club_compliance enable row level security;
drop policy if exists "Managers manage club compliance" on public.club_compliance;
create policy "Managers manage club compliance" on public.club_compliance for all
  using (public.can_manage_club(club_id))
  with check (public.can_manage_club(club_id));

alter table public.club_audit_log enable row level security;

drop policy if exists "Managers read club audit log" on public.club_audit_log;
create policy "Managers read club audit log" on public.club_audit_log for select
  using (public.can_manage_club(club_id));

create index if not exists club_audit_log_club_created_idx
  on public.club_audit_log (club_id, created_at desc);

create or replace function public.log_club_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  row_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  row_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_club_id uuid;
  target_id uuid;
begin
  -- Trigger records have the shape of their source table. Using a CASE
  -- expression here still tries to resolve both record fields, so `clubs`
  -- updates fail because that table has no `club_id` column.
  if tg_table_name = 'clubs' then
    target_club_id := coalesce(new.id, old.id);
  else
    target_club_id := coalesce(new.club_id, old.club_id);
  end if;
  target_id := coalesce(new.id, old.id);

  insert into public.club_audit_log (
    club_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_club_id, auth.uid(), lower(tg_op), tg_table_name, target_id, row_before, row_after
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clubs', 'club_officers', 'club_advisors', 'club_meetings',
    'club_media', 'club_announcements', 'club_compliance'
  ] loop
    execute format('drop trigger if exists audit_club_change on public.%I', table_name);
    execute format(
      'create trigger audit_club_change after insert or update or delete on public.%I for each row execute function public.log_club_change()',
      table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-media', 'club-media', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads club media files" on storage.objects;
create policy "Public reads club media files" on storage.objects for select
  using (bucket_id = 'club-media');

drop policy if exists "Managers upload club media files" on storage.objects;
create policy "Managers upload club media files" on storage.objects for insert
  with check (
    bucket_id = 'club-media'
    and public.can_manage_club(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Managers delete club media files" on storage.objects;
create policy "Managers delete club media files" on storage.objects for delete
  using (
    bucket_id = 'club-media'
    and public.can_manage_club(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================================
-- 08. release_security_hardening.sql
-- ============================================================================

-- Hatchx release security hardening.
-- Apply after club_governance.sql. This migration is idempotent.

-- The legacy directory view bypassed the caller's RLS context. The application
-- now reads the canonical public.clubs table, so remove the obsolete surface.
drop view if exists public.approved_clubs;

-- Public buckets serve objects by URL without a SELECT policy. Removing this
-- policy prevents anonymous clients from enumerating every stored object.
drop policy if exists "Public reads club media files" on storage.objects;

-- Repair the club audit trigger before tightening its execution privilege.
-- Trigger records have different shapes: `clubs` uses id, while child tables
-- use club_id. An IF branch prevents PostgreSQL from resolving the wrong field.
create or replace function public.log_club_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  row_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  row_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_club_id uuid;
  target_id uuid;
begin
  if tg_table_name = 'clubs' then
    target_club_id := coalesce(new.id, old.id);
  else
    target_club_id := coalesce(new.club_id, old.club_id);
  end if;
  target_id := coalesce(new.id, old.id);

  insert into public.club_audit_log (
    club_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_club_id, auth.uid(), lower(tg_op), tg_table_name, target_id, row_before, row_after
  );
  return coalesce(new, old);
end;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- broad grant, then explicitly restore only the RPC/helper access the app and
-- RLS policies require.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_staff_or_admin() from public, anon, authenticated;
revoke all on function public.set_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.can_govern_club(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_club(uuid) from public, anon, authenticated;
revoke all on function public.can_view_member_profile(uuid) from public, anon, authenticated;
revoke all on function public.club_interest_count(text) from public, anon, authenticated;
revoke all on function public.event_rsvp_count(text) from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff_or_admin() to anon, authenticated;
grant execute on function public.can_govern_club(uuid) to anon, authenticated;
grant execute on function public.can_manage_club(uuid) to anon, authenticated;
grant execute on function public.can_view_member_profile(uuid) to anon, authenticated;
grant execute on function public.club_interest_count(text) to anon, authenticated;
grant execute on function public.event_rsvp_count(text) to anon, authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Trigger functions must never be callable through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_profile_updated() from public, anon, authenticated;
revoke all on function public.capture_announcement_version() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.promote_approved_club_application() from public, anon, authenticated;
revoke all on function public.log_club_change() from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.sync_club_legacy_columns()') is not null then
    execute 'revoke all on function public.sync_club_legacy_columns() from public, anon, authenticated';
  end if;
end $$;

-- Pin trigger helper resolution to the intended schema. This prevents an
-- attacker-controlled search path from shadowing referenced database objects.
alter function public.handle_profile_updated() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- ============================================================================
-- 09. club_communication.sql
-- ============================================================================

-- Private club chat for approved members and club leadership.
-- Apply after club_governance.sql and release_security_hardening.sql.

create table if not exists public.club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_messages_club_created_idx
  on public.club_messages (club_id, created_at desc);

-- Keep the Club identifier available to authorized Realtime subscribers when
-- a row is deleted, so their open conversation can refresh correctly.
alter table public.club_messages replica identity full;

create or replace function public.can_access_club_chat(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.can_manage_club(p_club_id) or exists (
      select 1
      from public.club_memberships membership
      where membership.club_id = p_club_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
    )
  );
$$;

alter table public.club_messages enable row level security;

drop policy if exists "Club participants read messages" on public.club_messages;
create policy "Club participants read messages" on public.club_messages for select
  using (public.can_access_club_chat(club_id));

drop policy if exists "Club participants post messages" on public.club_messages;
create policy "Club participants post messages" on public.club_messages for insert
  with check (
    author_id = auth.uid()
    and public.can_access_club_chat(club_id)
  );

drop policy if exists "Authors and managers delete messages" on public.club_messages;
create policy "Authors and managers delete messages" on public.club_messages for delete
  using (author_id = auth.uid() or public.can_manage_club(club_id));

-- Return only the profile fields needed by chat. This avoids exposing member
-- email addresses while still showing recognizable names and avatars.
create or replace function public.get_club_chat_messages(
  p_club_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  club_id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  can_delete boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.club_id,
    message.author_id,
    coalesce(nullif(btrim(profile.full_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'Club member') as author_name,
    profile.avatar_url as author_avatar_url,
    message.body,
    message.created_at,
    message.updated_at,
    (message.author_id = auth.uid() or public.can_manage_club(message.club_id)) as can_delete
  from public.club_messages message
  join public.profiles profile on profile.id = message.author_id
  where message.club_id = p_club_id
  order by message.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.can_access_club_chat(uuid) from public, anon, authenticated;
revoke all on function public.get_club_chat_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.can_access_club_chat(uuid) to authenticated;
grant execute on function public.get_club_chat_messages(uuid, integer) to authenticated;

-- Supabase Realtime refreshes the open conversation when another participant
-- posts or removes a message. The block is safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_messages'
  ) then
    alter publication supabase_realtime add table public.club_messages;
  end if;
end $$;

-- ============================================================================
-- 10. chat_member_names.sql
-- ============================================================================

-- Backfill member display names and make Club chat use a recognizable,
-- non-email fallback for accounts that do not provide a full name.
begin;

update public.profiles profile
set full_name = coalesce(
  nullif(btrim(account.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(account.raw_user_meta_data ->> 'name'), ''),
  nullif(split_part(account.email, '@', 1), '')
)
from auth.users account
where profile.id = account.id
  and nullif(btrim(coalesce(profile.full_name, '')), '') is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  mapped_role text := 'student';
begin
  if lower(coalesce(new.email, '')) like '%@school.doe.gov'
     or lower(coalesce(new.email, '')) like '%@schools.nyc.gov' then
    mapped_role := 'advisor';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    mapped_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

create or replace function public.get_club_chat_messages(
  p_club_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  club_id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  can_delete boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.club_id,
    message.author_id,
    coalesce(nullif(btrim(profile.full_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'Club member') as author_name,
    profile.avatar_url as author_avatar_url,
    message.body,
    message.created_at,
    message.updated_at,
    (message.author_id = auth.uid() or public.can_manage_club(message.club_id)) as can_delete
  from public.club_messages message
  join public.profiles profile on profile.id = message.author_id
  where message.club_id = p_club_id
  order by message.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.get_club_chat_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_club_chat_messages(uuid, integer) to authenticated;

commit;

-- ============================================================================
-- 11. chat_recent_messages.sql
-- ============================================================================

-- Apply after club_communication.sql. Keep the newest messages, oldest first.
begin;
create or replace function public.get_club_chat_messages(p_club_id uuid,p_limit integer default 100)
returns table(id uuid,club_id uuid,author_id uuid,author_name text,author_avatar_url text,body text,created_at timestamptz,updated_at timestamptz,can_delete boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.can_access_club_chat(p_club_id) then
  raise exception 'Club chat access denied' using errcode='42501';
 end if;
 return query
 select message.id,message.club_id,message.author_id,
 coalesce(nullif(profile.full_name,''),'Club member'),profile.avatar_url,
 message.body,message.created_at,message.updated_at,
 (message.author_id=auth.uid() or public.can_manage_club(message.club_id))
 from (
  select m.* from public.club_messages m where m.club_id=p_club_id
  order by m.created_at desc,m.id desc
  limit least(greatest(coalesce(p_limit,100),1),200)
 ) message join public.profiles profile on profile.id=message.author_id
 order by message.created_at asc,message.id asc;
end $$;
revoke all on function public.get_club_chat_messages(uuid,integer) from public,anon;
grant execute on function public.get_club_chat_messages(uuid,integer) to authenticated;
commit;

-- ============================================================================
-- 12. chat_safety_moderation.sql
-- ============================================================================

-- Club chat rules, posting restrictions, restoration, and immutable moderation history.
-- Apply after club_communication.sql and chat_member_names.sql.

begin;

create table if not exists public.club_chat_agreements (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

create table if not exists public.club_chat_restrictions (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  restricted boolean not null default true,
  reason text,
  restricted_by uuid references public.profiles (id) on delete set null,
  restricted_at timestamptz,
  restored_by uuid references public.profiles (id) on delete set null,
  restored_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (club_id, profile_id),
  check (reason is null or char_length(btrim(reason)) between 3 and 500),
  check (not restricted or (reason is not null and restricted_at is not null))
);

create table if not exists public.club_chat_moderation_log (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('restricted', 'restored')),
  reason text,
  created_at timestamptz not null default now(),
  check (reason is null or char_length(btrim(reason)) between 3 and 500)
);

create index if not exists club_chat_moderation_log_club_created_idx
  on public.club_chat_moderation_log (club_id, created_at desc);

create or replace function public.can_moderate_club_chat(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    or exists (
      select 1 from public.club_advisors
      where club_id = p_club_id and profile_id = auth.uid()
    )
  );
$$;

create or replace function public.has_accepted_club_chat_rules(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.club_chat_agreements
    where club_id = p_club_id
      and profile_id = auth.uid()
      and policy_version = p_policy_version
  );
$$;

create or replace function public.is_club_chat_restricted(p_club_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select restricted from public.club_chat_restrictions
    where club_id = p_club_id and profile_id = p_profile_id
  ), false);
$$;

create or replace function public.can_post_club_chat(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.can_access_club_chat(p_club_id)
    and public.has_accepted_club_chat_rules(p_club_id, p_policy_version)
    and not public.is_club_chat_restricted(p_club_id, auth.uid());
$$;

create or replace function public.accept_club_chat_rules(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;
  if p_policy_version <> '2026-10-11' then
    raise exception 'Unsupported chat policy version' using errcode = '22023';
  end if;

  insert into public.club_chat_agreements (club_id, profile_id, policy_version, accepted_at)
  values (p_club_id, auth.uid(), p_policy_version, now())
  on conflict (club_id, profile_id) do update set
    policy_version = excluded.policy_version,
    accepted_at = excluded.accepted_at;
end;
$$;

create or replace function public.set_club_chat_restriction(
  p_club_id uuid,
  p_profile_id uuid,
  p_restricted boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_moderate_club_chat(p_club_id) then
    raise exception 'Chat moderation denied' using errcode = '42501';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'Moderators cannot change their own chat access' using errcode = '22023';
  end if;
  if p_restricted and (normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500) then
    raise exception 'A reason between 3 and 500 characters is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where club_id = p_club_id and profile_id = p_profile_id and status = 'active'
  ) then
    raise exception 'Only active Club members can be moderated' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_profile_id and role = 'admin')
     or exists (select 1 from public.club_advisors where club_id = p_club_id and profile_id = p_profile_id) then
    raise exception 'Advisor and Admin access must be changed through account governance' using errcode = '22023';
  end if;

  insert into public.club_chat_restrictions (
    club_id, profile_id, restricted, reason, restricted_by, restricted_at,
    restored_by, restored_at, updated_at
  ) values (
    p_club_id, p_profile_id, p_restricted,
    case when p_restricted then normalized_reason else null end,
    case when p_restricted then auth.uid() else null end,
    case when p_restricted then now() else null end,
    case when p_restricted then null else auth.uid() end,
    case when p_restricted then null else now() end,
    now()
  )
  on conflict (club_id, profile_id) do update set
    restricted = excluded.restricted,
    reason = excluded.reason,
    restricted_by = excluded.restricted_by,
    restricted_at = excluded.restricted_at,
    restored_by = excluded.restored_by,
    restored_at = excluded.restored_at,
    updated_at = now();

  insert into public.club_chat_moderation_log (club_id, profile_id, actor_id, action, reason)
  values (p_club_id, p_profile_id, auth.uid(), case when p_restricted then 'restricted' else 'restored' end, normalized_reason);
end;
$$;

create or replace function public.get_club_chat_state(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns table (
  agreed boolean,
  restricted boolean,
  restriction_reason text,
  can_moderate boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;
  return query select
    public.has_accepted_club_chat_rules(p_club_id, p_policy_version),
    public.is_club_chat_restricted(p_club_id, auth.uid()),
    (select reason from public.club_chat_restrictions where club_id = p_club_id and profile_id = auth.uid() and club_chat_restrictions.restricted),
    public.can_moderate_club_chat(p_club_id);
end;
$$;

create or replace function public.get_club_chat_moderation_members(p_club_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  restricted boolean,
  restriction_reason text,
  restricted_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_moderate_club_chat(p_club_id) then
    raise exception 'Chat moderation denied' using errcode = '42501';
  end if;
  return query
  select membership.profile_id,
    coalesce(nullif(btrim(profile.full_name), ''), 'Club member'),
    coalesce(restriction.restricted, false),
    restriction.reason,
    restriction.restricted_at
  from public.club_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  left join public.club_chat_restrictions restriction
    on restriction.club_id = membership.club_id and restriction.profile_id = membership.profile_id
  where membership.club_id = p_club_id
    and membership.status = 'active'
    and profile.role <> 'admin'
    and not exists (
      select 1 from public.club_advisors advisor
      where advisor.club_id = p_club_id and advisor.profile_id = membership.profile_id
    )
  order by coalesce(nullif(btrim(profile.full_name), ''), 'Club member');
end;
$$;

alter table public.club_chat_agreements enable row level security;
alter table public.club_chat_restrictions enable row level security;
alter table public.club_chat_moderation_log enable row level security;

drop policy if exists "Members read own chat agreement" on public.club_chat_agreements;
create policy "Members read own chat agreement" on public.club_chat_agreements for select
  using (profile_id = auth.uid() or public.can_moderate_club_chat(club_id));

drop policy if exists "Members read relevant chat restriction" on public.club_chat_restrictions;
create policy "Members read relevant chat restriction" on public.club_chat_restrictions for select
  using (profile_id = auth.uid() or public.can_moderate_club_chat(club_id));

drop policy if exists "Moderators read chat history" on public.club_chat_moderation_log;
create policy "Moderators read chat history" on public.club_chat_moderation_log for select
  using (public.can_moderate_club_chat(club_id));

drop policy if exists "Club participants post messages" on public.club_messages;
drop policy if exists "Rule-accepting unrestricted participants post messages" on public.club_messages;
create policy "Rule-accepting unrestricted participants post messages" on public.club_messages for insert
  with check (
    author_id = auth.uid()
    and public.can_post_club_chat(club_id, '2026-10-11')
  );

revoke all on function public.can_moderate_club_chat(uuid) from public, anon, authenticated;
revoke all on function public.has_accepted_club_chat_rules(uuid, text) from public, anon, authenticated;
revoke all on function public.is_club_chat_restricted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_post_club_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_club_chat_rules(uuid, text) from public, anon, authenticated;
revoke all on function public.set_club_chat_restriction(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.get_club_chat_state(uuid, text) from public, anon, authenticated;
revoke all on function public.get_club_chat_moderation_members(uuid) from public, anon, authenticated;

grant execute on function public.can_moderate_club_chat(uuid) to authenticated;
grant execute on function public.has_accepted_club_chat_rules(uuid, text) to authenticated;
grant execute on function public.is_club_chat_restricted(uuid, uuid) to authenticated;
grant execute on function public.can_post_club_chat(uuid, text) to authenticated;
grant execute on function public.accept_club_chat_rules(uuid, text) to authenticated;
grant execute on function public.set_club_chat_restriction(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.get_club_chat_state(uuid, text) to authenticated;
grant execute on function public.get_club_chat_moderation_members(uuid) to authenticated;

commit;

-- ============================================================================
-- 13. opportunity_scholarships.sql
-- ============================================================================

-- Add scholarships to an existing opportunity catalog.
-- New databases already receive this value through core_platform.sql.

alter table public.opportunities
  drop constraint if exists opportunities_category_check;

alter table public.opportunities
  add constraint opportunities_category_check
  check (category in (
    'election',
    'community_service',
    'internship',
    'pre_college',
    'scholarship',
    'discount'
  ));

-- ============================================================================
-- 14. account_roles_and_review.sql
-- ============================================================================

-- Apply after the existing platform migrations. Existing users retain roles.
begin;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('student','teacher','advisor','staff','admin'));
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,avatar_url,role) values(new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url',case when lower(split_part(new.email,'@',2)) in ('schools.nyc.gov','school.doe.gov') then 'teacher' else 'student' end) on conflict(id) do nothing;
 return new;
end $$;
create table if not exists public.account_role_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id),profile_id uuid references public.profiles(id),previous_role text,new_role text,club_id uuid references public.clubs(id),created_at timestamptz not null default now());
alter table public.account_role_audit enable row level security;
drop policy if exists "Admins read account role history" on public.account_role_audit;
create policy "Admins read account role history" on public.account_role_audit for select using(public.is_admin());

-- Serialize role changes, guard the final admin, and bind advisors atomically.
create or replace function public.assign_account_role(p_user_id uuid,p_role text,p_club_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare old_role text;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_role not in ('student','teacher','advisor','staff','admin') then raise exception 'Invalid role'; end if;
 perform pg_advisory_xact_lock(761592);
 select role into old_role from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Account not found'; end if;
 if old_role='admin' and p_role<>'admin' and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'The last administrator cannot be demoted'; end if;
 if p_role='advisor' then
  if p_club_id is null then raise exception 'Choose a club for this advisor'; end if;
  insert into public.club_advisors(club_id,profile_id) values(p_club_id,p_user_id) on conflict(club_id,profile_id) do nothing;
 elsif old_role='advisor' then delete from public.club_advisors where profile_id=p_user_id;
 end if;
 update public.profiles set role=p_role where id=p_user_id;
 insert into public.account_role_audit(actor_id,profile_id,previous_role,new_role,club_id) values(auth.uid(),p_user_id,old_role,p_role,p_club_id);
end $$;
create or replace function public.set_user_role(p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.assign_account_role(p_user_id,p_role,null); end $$;

create table if not exists public.school_announcement_submissions(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),author_id uuid not null references public.profiles(id),
 title text not null check(char_length(btrim(title)) between 3 and 120),body text not null check(char_length(btrim(body)) between 3 and 10000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),review_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 announcement_id uuid references public.announcements(id),created_at timestamptz not null default now());
alter table public.school_announcement_submissions enable row level security;
drop policy if exists "Authors and admins read submissions" on public.school_announcement_submissions;
create policy "Authors and admins read submissions" on public.school_announcement_submissions for select using(author_id=auth.uid() or public.is_admin());
drop policy if exists "Club leaders submit for review" on public.school_announcement_submissions;
create policy "Club leaders submit for review" on public.school_announcement_submissions for insert with check(author_id=auth.uid() and public.can_manage_club(club_id) and status='pending' and reviewed_by is null and reviewed_at is null and announcement_id is null and review_note is null);
create or replace function public.review_school_announcement(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare submission public.school_announcement_submissions; published_id uuid;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_approve is null then raise exception 'Choose approve or reject'; end if;
 select * into submission from public.school_announcement_submissions where id=p_id for update;
 if not found or submission.status<>'pending' then raise exception 'Submission is no longer pending'; end if;
 if not p_approve and char_length(btrim(coalesce(p_note,'')))<3 then raise exception 'Give a rejection reason'; end if;
 if p_approve then insert into public.announcements(title,body,tag,created_by,published) values(submission.title,submission.body,'Announcements',submission.author_id,true) returning id into published_id; end if;
 update public.school_announcement_submissions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,2000),announcement_id=published_id where id=p_id;
end $$;
revoke all on function public.assign_account_role(uuid,text,uuid),public.review_school_announcement(uuid,boolean,text) from public,anon;
grant execute on function public.assign_account_role(uuid,text,uuid),public.review_school_announcement(uuid,boolean,text) to authenticated;
grant select on public.account_role_audit to authenticated;
grant select,insert on public.school_announcement_submissions to authenticated;
commit;

-- ============================================================================
-- 15. custom_permissions.sql
-- ============================================================================

-- Apply after account_roles_and_review.sql. Custom roles never imply admin.
begin;
create table if not exists public.custom_roles(id uuid primary key default gen_random_uuid(),name text unique not null check(char_length(btrim(name)) between 2 and 60),permissions text[] not null default '{}',created_at timestamptz not null default now(),check(permissions <@ array['clubs.manage','clubs.govern','site.manage']::text[]));
create table if not exists public.custom_role_assignments(id uuid primary key default gen_random_uuid(),role_id uuid not null references public.custom_roles(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,club_id uuid references public.clubs(id) on delete cascade,created_at timestamptz not null default now());
create unique index if not exists custom_role_assignment_unique on public.custom_role_assignments(role_id,profile_id,coalesce(club_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.custom_roles enable row level security;
alter table public.custom_role_assignments enable row level security;
drop policy if exists "Read custom roles" on public.custom_roles;
create policy "Read custom roles" on public.custom_roles for select to authenticated using(true);
drop policy if exists "Admin manage custom roles" on public.custom_roles;
create policy "Admin manage custom roles" on public.custom_roles for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Read assigned roles" on public.custom_role_assignments;
create policy "Read assigned roles" on public.custom_role_assignments for select using(profile_id=auth.uid() or public.is_admin());
drop policy if exists "Admin manage assigned roles" on public.custom_role_assignments;
create policy "Admin manage assigned roles" on public.custom_role_assignments for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.has_custom_permission(p_permission text,p_club_id uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.custom_role_assignments a join public.custom_roles r on r.id=a.role_id where a.profile_id=auth.uid() and p_permission=any(r.permissions) and (a.club_id is null or a.club_id=p_club_id));
$$;
-- A role assignment may delegate content editing or governance independently.
create or replace function public.can_govern_club(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_staff_or_admin() or public.has_custom_permission('clubs.govern',p_club_id) or exists(select 1 from public.club_advisors where club_id=p_club_id and profile_id=auth.uid());
$$;
create or replace function public.can_manage_club(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.can_govern_club(p_club_id) or public.has_custom_permission('clubs.manage',p_club_id) or exists(select 1 from public.club_officers where club_id=p_club_id and profile_id=auth.uid() and (term_start is null or term_start<=current_date) and (term_end is null or term_end>=current_date));
$$;
revoke all on function public.has_custom_permission(text,uuid) from public;
grant execute on function public.has_custom_permission(text,uuid) to anon,authenticated;
grant select,insert,update,delete on public.custom_roles,public.custom_role_assignments to authenticated;

-- Only public content belongs here. Never store keys or private contacts.
create table if not exists public.site_content(key text primary key,body text not null check(char_length(body) between 1 and 4000),updated_by uuid references public.profiles(id),updated_at timestamptz not null default now());
alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content enable row level security;
drop policy if exists "Public site content" on public.site_content;
create policy "Public site content" on public.site_content for select using(true);
drop policy if exists "Manage site content" on public.site_content;
create policy "Manage site content" on public.site_content for all using(public.is_admin() or public.has_custom_permission('site.manage',null)) with check(public.is_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content to anon,authenticated;
grant insert,update,delete on public.site_content to authenticated;

-- Resolve all authorized clubs in one request, including scoped custom roles.
create or replace function public.get_managed_club_ids() returns setof uuid
language sql stable security definer set search_path=public as $$
 select id from public.clubs where auth.uid() is not null and public.can_manage_club(id);
$$;
revoke all on function public.get_managed_club_ids() from public,anon;
grant execute on function public.get_managed_club_ids() to authenticated;

-- A content editor cannot publish/archive a club through direct API calls.
-- SQL Editor/service operations have no user id and retain maintenance access.
create or replace function public.guard_club_publication() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status and auth.uid() is not null and not public.is_staff_or_admin() then
  raise exception 'Only staff may change club publication status' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_club_publication() from public,anon,authenticated;
drop trigger if exists guard_club_publication on public.clubs;
create trigger guard_club_publication before update on public.clubs for each row execute function public.guard_club_publication();

-- Governance needs the club roster, but content-only editors do not get emails.
create or replace function public.can_view_member_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_staff_or_admin() or exists (
  select 1 from public.club_memberships m
  where m.profile_id=p_profile_id and public.can_govern_club(m.club_id)
 );
$$;

-- Append-only evidence for custom grants and public text changes.
create table if not exists public.management_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid,
 resource text not null, operation text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.management_audit enable row level security;
drop policy if exists "Admin read management audit" on public.management_audit;
create policy "Admin read management audit" on public.management_audit for select using(public.is_admin());
grant select on public.management_audit to authenticated;
create or replace function public.audit_management_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.management_audit(actor_id,resource,operation,before_data,after_data)
 values(auth.uid(),tg_table_name,tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return null;
end $$;
revoke all on function public.audit_management_change() from public,anon,authenticated;
drop trigger if exists custom_roles_audit on public.custom_roles;
create trigger custom_roles_audit after insert or update or delete on public.custom_roles for each row execute function public.audit_management_change();
drop trigger if exists custom_assignments_audit on public.custom_role_assignments;
create trigger custom_assignments_audit after insert or update or delete on public.custom_role_assignments for each row execute function public.audit_management_change();
drop trigger if exists site_content_audit on public.site_content;
create trigger site_content_audit after insert or update or delete on public.site_content for each row execute function public.audit_management_change();
commit;

-- ============================================================================
-- 16. operational_intelligence.sql
-- ============================================================================

-- Search analytics, operational errors, and broad administrative audit coverage.
begin;
create table if not exists public.search_analytics(id bigint generated always as identity primary key,query text not null check(char_length(query) between 2 and 80),normalized_query text not null check(char_length(normalized_query) between 2 and 80),result_count integer not null check(result_count>=0),user_id uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now());
create index if not exists search_analytics_zero_created_idx on public.search_analytics(created_at desc) where result_count=0;
create index if not exists search_analytics_query_idx on public.search_analytics(normalized_query,created_at desc);
alter table public.search_analytics enable row level security;
drop policy if exists "Admins read search analytics" on public.search_analytics;
create policy "Admins read search analytics" on public.search_analytics for select using(public.is_admin());
grant select on public.search_analytics to authenticated;
create or replace function public.record_search_analytics(p_query text,p_result_count integer) returns void language plpgsql security definer set search_path=public as $$ declare clean text:=left(trim(regexp_replace(coalesce(p_query,''),'\s+',' ','g')),80); begin if char_length(clean)<2 or p_result_count<0 then return; end if; insert into public.search_analytics(query,normalized_query,result_count,user_id) values(clean,lower(clean),p_result_count,auth.uid()); end $$;
revoke all on function public.record_search_analytics(text,integer) from public;
grant execute on function public.record_search_analytics(text,integer) to anon,authenticated;

create table if not exists public.system_errors(id bigint generated always as identity primary key,source text not null,message text not null,context jsonb not null default '{}',resolved_at timestamptz,created_at timestamptz not null default now());
create index if not exists system_errors_open_created_idx on public.system_errors(created_at desc) where resolved_at is null;
alter table public.system_errors enable row level security;
drop policy if exists "Admins read system errors" on public.system_errors;
create policy "Admins read system errors" on public.system_errors for select using(public.is_admin());
grant select on public.system_errors to authenticated;
create or replace function public.record_system_error(p_source text,p_message text,p_context jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$ begin if auth.uid() is null then return; end if; insert into public.system_errors(source,message,context) values(left(coalesce(nullif(trim(p_source),''),'application'),80),left(coalesce(nullif(trim(p_message),''),'Unknown error'),1000),coalesce(p_context,'{}')); end $$;
revoke all on function public.record_system_error(text,text,jsonb) from public;
grant execute on function public.record_system_error(text,text,jsonb) to authenticated;

alter table public.management_audit add column if not exists search_text text not null default '';
update public.management_audit set search_text=concat_ws(' ',resource,operation,before_data::text,after_data::text) where search_text='';
alter table public.management_audit add column if not exists search_vector tsvector generated always as(to_tsvector('simple',search_text)) stored;
create index if not exists management_audit_search_idx on public.management_audit using gin(search_vector);
create or replace function public.audit_management_change() returns trigger language plpgsql security definer set search_path=public as $$ declare before_value jsonb; after_value jsonb; begin before_value:=case when tg_op<>'INSERT' then to_jsonb(old) end; after_value:=case when tg_op<>'DELETE' then to_jsonb(new) end; insert into public.management_audit(actor_id,resource,operation,before_data,after_data,search_text) values(auth.uid(),tg_table_name,tg_op,before_value,after_value,concat_ws(' ',tg_table_name,tg_op,before_value::text,after_value::text)); return null; end $$;
do $$ declare table_name text; begin foreach table_name in array array['clubs','club_memberships','club_applications','support_requests','support_request_updates','opportunities','events'] loop execute format('drop trigger if exists %I on public.%I',table_name||'_global_audit',table_name); execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_management_change()',table_name||'_global_audit',table_name); end loop; end $$;
commit;

-- ============================================================================
-- 17. editable_support_content.sql
-- ============================================================================

-- Adds Admin-editable Support FAQs and Help Guide content.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;

insert into public.site_content(key, body)
values
  ('support_faqs', 'Who can I contact about a technical issue? || Submit a Technical Support request below. The support team will respond in the request conversation.\nHow do I track a request? || Open My requests on this page to view its status and replies.'),
  ('manual_content', 'STUDENTS\nSign in with your school account, browse Activities & Clubs, join a Club, follow Updates & Calendar, and track requests from Support.\n\nADVISORS & CLUB OFFICERS\nOpen Manage My Clubs to update Club information, meetings, members, announcements, media, attendance, treasury records, Constitution, and elections.\n\nADMINISTRATORS\nUse Admin to review Club applications, announcements, support requests, accounts, and public content.\n\nNEED HELP?\nSubmit a Support request and continue the conversation from My requests.')
on conflict (key) do nothing;

commit;

-- ============================================================================
-- 18. site_cms_content.sql
-- ============================================================================

-- Expands the audited public-content editor beyond the original four snippets.
-- Run after custom_permissions.sql and editable_support_content.sql.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content drop constraint if exists site_content_body_check;
alter table public.site_content add constraint site_content_body_check check (
  char_length(body) <= 4000 and (char_length(body) >= 1 or key in ('support_location','footer_contact'))
) not valid;

insert into public.site_content(key, body) values
  ('site_name','Hatchx'),
  ('home_title','Anchored in Excellence'),
  ('home_cta_label','Explore'),
  ('about_heading','Opportunity was everywhere. Access was not.'),
  ('about_body','Clubs had energy. Events had potential. Students wanted to participate. But the path between them was fragmented across flyers, links, announcements, and conversations. Hatchx was created to close that gap—turning scattered information into a clear invitation to take part.'),
  ('about_card_1_title','Student first'),
  ('about_card_1_body','Every decision begins with a simple question: does this make school life easier to navigate?'),
  ('about_card_2_title','Open by design'),
  ('about_card_2_body','Opportunity should be visible. Clear information helps more students find where they belong.'),
  ('about_card_3_title','Built to last'),
  ('about_card_3_body','Hatchx turns student energy into systems future classes can continue, improve, and trust.'),
  ('support_heading','We are here to help!'),
  ('support_response_time','Average response time: within two school days.'),
  ('support_location','For in-person help, visit the S.O. office in Room 131.'),
  ('footer_contact','')
on conflict (key) do nothing;

drop policy if exists "Manage site content" on public.site_content;
create policy "Manage site content" on public.site_content for all
using(public.is_staff_or_admin() or public.has_custom_permission('site.manage',null))
with check(public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));

-- CMS writes outside announcements should be visible in the management audit.
drop trigger if exists events_global_audit on public.events;
create trigger events_global_audit after insert or update or delete on public.events
for each row execute function public.audit_management_change();
drop trigger if exists opportunities_global_audit on public.opportunities;
create trigger opportunities_global_audit after insert or update or delete on public.opportunities
for each row execute function public.audit_management_change();

commit;

-- ============================================================================
-- 19. hatchx_rebrand.sql
-- ============================================================================

-- One-time public brand migration. Preserve administrator-customized content.
update public.site_content
set body = 'Hatchx', updated_at = now()
where key = 'site_name' and body = 'Bayside' || ' Hub';

update public.site_content
set body = replace(body, 'Bayside' || ' Hub', 'Hatchx'), updated_at = now()
where key in ('about_intro', 'about_body')
  and body like '%Bayside' || ' Hub%';

update public.site_content set body = 'Hatchx brings the people, possibilities, and momentum of Bayside High School into one student-built platform.', updated_at = now() where key = 'about_intro' and body = 'Hatchx is Bayside High School''s one-stop platform for activities, clubs, events, and opportunities.';
update public.site_content set body = 'Opportunity was everywhere. Access was not.', updated_at = now() where key = 'about_heading' and body = 'Anchored in Excellence';
update public.site_content set body = 'Clubs had energy. Events had potential. Students wanted to participate. But the path between them was fragmented across flyers, links, announcements, and conversations. Hatchx was created to close that gap—turning scattered information into a clear invitation to take part.', updated_at = now() where key = 'about_body' and body like 'Hatchx is Bayside High School%';
update public.site_content set body = 'Student first', updated_at = now() where key = 'about_card_1_title' and body = 'Everything in one place';
update public.site_content set body = 'Every decision begins with a simple question: does this make school life easier to navigate?', updated_at = now() where key = 'about_card_1_body' and body = 'Announcements, club listings, calendars, and opportunities — a single source of truth for school life.';
update public.site_content set body = 'Open by design', updated_at = now() where key = 'about_card_2_title' and body = 'Built by students';
update public.site_content set body = 'Opportunity should be visible. Clear information helps more students find where they belong.', updated_at = now() where key = 'about_card_2_body' and body = 'Developed and maintained by the Bayside student dev team, guided by advisors and the S.O. office.';
update public.site_content set body = 'Built to last', updated_at = now() where key = 'about_card_3_title' and body = 'Open to every Baysider';
update public.site_content set body = 'Hatchx turns student energy into systems future classes can continue, improve, and trust.', updated_at = now() where key = 'about_card_3_body' and body = 'Every Baysider can browse, join clubs, and find opportunities with their NYC school account.';

-- ============================================================================
-- 20. top_school_notice.sql
-- ============================================================================

-- Editable, switchable global school notice. Run after site_cms_content.sql.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content drop constraint if exists site_content_body_check;
alter table public.site_content add constraint site_content_body_check check (
  char_length(body) <= 4000 and (char_length(body) >= 1 or key in ('support_location','footer_contact','school_notice_text'))
) not valid;

insert into public.site_content(key, body) values
  ('school_notice_enabled','true'),
  ('school_notice_text','No clubs may meet on October 14th or 15th due to the Fall Open House, and no unsupervised clubs may meet on floors 2, 3, and 4 on October 8th and October 22nd due to PSAT preparations.'),
  ('school_notice_background','#ff8500'),
  ('school_notice_text_color','#101010')
on conflict (key) do nothing;

commit;

-- ============================================================================
-- 21. club_attendance.sql
-- ============================================================================

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
  comments text check (comments is null or char_length(comments) <= 1000),
  unique (session_id, profile_id)
);

alter table public.club_attendance_records add column if not exists comments text;
alter table public.club_attendance_records drop constraint if exists club_attendance_records_comments_check;
alter table public.club_attendance_records add constraint club_attendance_records_comments_check
  check (comments is null or char_length(comments) <= 1000);

-- Attendance exports include the student's OSIS. This remains idempotent with
-- the student registration section later in this consolidated schema.
alter table public.profiles add column if not exists osis_number text;
alter table public.profiles add column if not exists so_number text;
alter table public.profiles drop constraint if exists profiles_so_number_check;
alter table public.profiles add constraint profiles_so_number_check
  check (so_number is null or char_length(btrim(so_number)) between 1 and 50);
grant update (so_number) on table public.profiles to authenticated;

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
drop function if exists public.check_in_to_club(text);
create or replace function public.check_in_to_club(p_code text, p_comments text default null)
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

  if char_length(coalesce(p_comments, '')) > 1000 then
    return query select 'invalid', 'Comments must be 1,000 characters or fewer.', null::text, null::text;
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

-- Managers can review a minimal roster without receiving member email
-- addresses or unrelated profile fields.
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

revoke all on function public.check_in_to_club(text, text) from public, anon;
grant execute on function public.check_in_to_club(text, text) to authenticated;
revoke all on function public.get_club_attendance_records(uuid, integer) from public, anon;
grant execute on function public.get_club_attendance_records(uuid, integer) to authenticated;
revoke all on function public.get_my_club_attendance(integer) from public, anon;
grant execute on function public.get_my_club_attendance(integer) to authenticated;

-- ============================================================================
-- 22. attendance_scheduling.sql
-- ============================================================================

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

create or replace function public.check_in_to_club(p_code text, p_comments text default null)
returns table (result text, message text, club_slug text, session_label text)
language plpgsql security definer set search_path=public as $$
declare target public.club_attendance_sessions%rowtype; target_slug text; scheduled_start timestamptz; scheduled_label text; scheduled_slug text;
begin
  if auth.uid() is null then
    return query select 'unauthenticated','Sign in before checking in.',null::text,null::text; return;
  end if;

  if char_length(coalesce(p_comments, '')) > 1000 then
    return query select 'invalid','Comments must be 1,000 characters or fewer.',null::text,null::text; return;
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

  insert into public.club_attendance_records(session_id,club_id,profile_id,comments)
  values(target.id,target.club_id,auth.uid(),nullif(btrim(p_comments),'')) on conflict(session_id,profile_id) do nothing;
  if found then
    return query select 'checked_in','Check-in complete.',target_slug,target.label;
  else
    if nullif(btrim(p_comments),'') is not null then
      update public.club_attendance_records set comments=nullif(btrim(p_comments),'')
      where session_id=target.id and profile_id=auth.uid();
    end if;
    return query select 'already_checked_in','You are already checked in for this activity.',target_slug,target.label;
  end if;
end $$;
revoke all on function public.check_in_to_club(text,text) from public,anon;
grant execute on function public.check_in_to_club(text,text) to authenticated;

commit;

-- ============================================================================
-- 23. club_fair_qr_links.sql
-- ============================================================================

-- Expiring public QR links for Club fairs and recruitment events.
-- Run after core_platform.sql and custom_permissions.sql.
begin;

create table if not exists public.club_share_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 3 and 120),
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists club_share_links_club_created_idx
on public.club_share_links(club_id, created_at desc);
create index if not exists club_share_links_public_lookup_idx
on public.club_share_links(id) where active;

alter table public.club_share_links enable row level security;
drop policy if exists "Managers read Club share links" on public.club_share_links;
drop policy if exists "Managers create Club share links" on public.club_share_links;
drop policy if exists "Managers update Club share links" on public.club_share_links;
create policy "Managers read Club share links" on public.club_share_links for select
using(public.can_manage_club(club_id));
create policy "Managers create Club share links" on public.club_share_links for insert
with check(public.can_manage_club(club_id) and created_by=auth.uid());
create policy "Managers update Club share links" on public.club_share_links for update
using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
drop policy if exists "Public opens current Club share links" on public.club_share_links;

-- Public visitors resolve an opaque token without receiving creator or audit data.
create or replace function public.resolve_club_share_link(p_id uuid)
returns table(club_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select link.club_id
  from public.club_share_links link
  join public.clubs club on club.id = link.club_id
  where link.id = p_id
    and link.active
    and link.expires_at > now()
    and club.status = 'published'
  limit 1;
$$;
revoke all on function public.resolve_club_share_link(uuid) from public;
grant execute on function public.resolve_club_share_link(uuid) to anon, authenticated;

grant select on public.club_share_links to authenticated;
grant insert,update on public.club_share_links to authenticated;

drop trigger if exists club_share_links_audit on public.club_share_links;
create trigger club_share_links_audit after insert or update or delete on public.club_share_links
for each row execute function public.audit_management_change();

commit;

-- ============================================================================
-- 24. student_registration_invites.sql
-- ============================================================================

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

-- ============================================================================
-- 25. announcement_cms_workflow.sql
-- ============================================================================

-- Run after core_platform.sql and custom_permissions.sql.
begin;

alter table public.announcements add column if not exists publish_at timestamptz;
create index if not exists announcements_schedule_idx on public.announcements(publish_at) where published and archived_at is null;

-- A scheduled item becomes visible when its clock passes; no cron job required.
drop policy if exists "Anyone can read published announcements" on public.announcements;
create policy "Anyone can read published announcements" on public.announcements for select
using ((published and archived_at is null and (publish_at is null or publish_at <= now())) or archived_at is not null);

drop policy if exists "Public reads announcement history" on public.announcement_versions;
create policy "Public reads announcement history" on public.announcement_versions for select
using (exists (select 1 from public.announcements a where a.id = announcement_id and ((a.published and a.archived_at is null and (a.publish_at is null or a.publish_at <= now())) or a.archived_at is not null)));

create table if not exists public.announcement_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_key text not null check (draft_key = 'new' or draft_key ~ '^[0-9a-f-]{36}$'),
  title text not null default '' check (char_length(title) <= 120),
  tag text not null default 'Announcements' check (tag in ('Announcements','Events','Clubs','Sports','Opportunities')),
  body text not null default '' check (char_length(body) <= 10000),
  publish_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);
alter table public.announcement_drafts enable row level security;
drop policy if exists "Staff own announcement drafts" on public.announcement_drafts;
create policy "Staff own announcement drafts" on public.announcement_drafts for all
using (user_id = auth.uid() and public.is_staff_or_admin())
with check (user_id = auth.uid() and public.is_staff_or_admin());
grant select, insert, update, delete on public.announcement_drafts to authenticated;

commit;

-- ============================================================================
-- 26. announcement_calendar_enhancements.sql
-- ============================================================================

-- Announcement urgency/lifetime controls and administrator-managed calendars.
-- Run after announcement_cms_workflow.sql and core_platform.sql.
begin;

alter table public.announcements add column if not exists priority text not null default 'normal'
  check (priority in ('normal','important','urgent'));
alter table public.announcements add column if not exists pinned_until timestamptz;
alter table public.announcements add column if not exists expires_at timestamptz;
alter table public.announcements drop constraint if exists announcements_lifetime_check;
alter table public.announcements add constraint announcements_lifetime_check
  check (expires_at is null or publish_at is null or expires_at > publish_at) not valid;

alter table public.announcement_drafts add column if not exists priority text not null default 'normal'
  check (priority in ('normal','important','urgent'));
alter table public.announcement_drafts add column if not exists pinned_until timestamptz;
alter table public.announcement_drafts add column if not exists expires_at timestamptz;

drop policy if exists "Anyone can read published announcements" on public.announcements;
create policy "Anyone can read published announcements" on public.announcements for select
using (
  (published and archived_at is null and (publish_at is null or publish_at <= now()) and (expires_at is null or expires_at > now()))
  or archived_at is not null
);

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  color text not null default '#263A99' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.events add column if not exists calendar_id uuid references public.calendar_sources(id) on delete set null;
create index if not exists events_calendar_start_idx on public.events(calendar_id,start_at);
alter table public.calendar_sources enable row level security;

drop policy if exists "Public reads active calendars" on public.calendar_sources;
drop policy if exists "Admins manage calendars" on public.calendar_sources;
create policy "Public reads active calendars" on public.calendar_sources for select
  using (active or public.is_staff_or_admin());
create policy "Admins manage calendars" on public.calendar_sources for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.calendar_sources to anon,authenticated;
grant insert,update,delete on public.calendar_sources to authenticated;

drop policy if exists "Public reads published events" on public.events;
create policy "Public reads published events" on public.events for select using (
  published = true and (
    calendar_id is null or exists (
      select 1 from public.calendar_sources source where source.id = calendar_id and source.active
    )
  )
);

do $$ begin
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists calendar_sources_global_audit on public.calendar_sources;
    create trigger calendar_sources_global_audit after insert or update or delete on public.calendar_sources
      for each row execute function public.audit_management_change();
  end if;
end $$;

commit;

-- ============================================================================
-- 27. calendar_meeting_emergency.sql
-- ============================================================================

-- Calendar meeting exceptions and a dedicated emergency announcement level.
-- Run after announcement_calendar_enhancements.sql and core_platform.sql.
begin;

alter table public.events add column if not exists meeting_effect text not null default 'none';
alter table public.events add column if not exists affected_club_id uuid references public.clubs(id) on delete cascade;
alter table public.events drop constraint if exists events_meeting_effect_check;
alter table public.events add constraint events_meeting_effect_check check (
  (meeting_effect='none' and affected_club_id is null)
  or (meeting_effect='all' and affected_club_id is null)
  or (meeting_effect='club' and affected_club_id is not null)
);
alter table public.events drop constraint if exists events_meeting_effect_value_check;
alter table public.events add constraint events_meeting_effect_value_check
  check (meeting_effect in ('none','all','club'));
create index if not exists events_meeting_effect_dates_idx
  on public.events(meeting_effect,start_at,end_at) where published and meeting_effect<>'none';
create index if not exists events_affected_club_idx
  on public.events(affected_club_id,start_at) where affected_club_id is not null;

create or replace function public.enforce_event_meeting_effect_admin() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.meeting_effect<>'none' and not public.is_admin() then
    raise exception 'Only administrators may cancel Club meetings' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_event_meeting_effect_admin() from public,anon,authenticated;
drop trigger if exists enforce_event_meeting_effect_admin on public.events;
create trigger enforce_event_meeting_effect_admin before insert or update of meeting_effect,affected_club_id
  on public.events for each row execute function public.enforce_event_meeting_effect_admin();

alter table public.announcements drop constraint if exists announcements_priority_check;
alter table public.announcements add constraint announcements_priority_check
  check (priority in ('normal','important','urgent','emergency'));
alter table public.announcement_drafts drop constraint if exists announcement_drafts_priority_check;
alter table public.announcement_drafts add constraint announcement_drafts_priority_check
  check (priority in ('normal','important','urgent','emergency'));

commit;

-- ============================================================================
-- 28. announcement_audience_notifications.sql
-- ============================================================================

-- Targeted announcement visibility and delivery.
-- Run after workflow_completion.sql and calendar_meeting_emergency.sql.
begin;

alter table public.profiles add column if not exists grade_level smallint
  check (grade_level between 9 and 12);

alter table public.announcements add column if not exists audience_type text not null default 'school'
  check (audience_type in ('school','grades','clubs'));
alter table public.announcements add column if not exists audience_grades smallint[] not null default '{}';
alter table public.announcements add column if not exists audience_club_ids uuid[] not null default '{}';
alter table public.announcements add column if not exists notify_in_app boolean not null default true;
alter table public.announcements add column if not exists notify_email boolean not null default false;
alter table public.announcements add column if not exists notifications_sent_at timestamptz;

alter table public.announcement_drafts add column if not exists audience_type text not null default 'school'
  check (audience_type in ('school','grades','clubs'));
alter table public.announcement_drafts add column if not exists audience_grades smallint[] not null default '{}';
alter table public.announcement_drafts add column if not exists audience_club_ids uuid[] not null default '{}';
alter table public.announcement_drafts add column if not exists notify_in_app boolean not null default true;
alter table public.announcement_drafts add column if not exists notify_email boolean not null default false;

alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check check (
  (audience_type='school' and cardinality(audience_grades)=0 and cardinality(audience_club_ids)=0)
  or (audience_type='grades' and cardinality(audience_grades)>0 and audience_grades <@ array[9,10,11,12]::smallint[] and cardinality(audience_club_ids)=0)
  or (audience_type='clubs' and cardinality(audience_club_ids)>0 and cardinality(audience_grades)=0)
);
alter table public.announcement_drafts drop constraint if exists announcement_drafts_audience_check;
alter table public.announcement_drafts add constraint announcement_drafts_audience_check check (
  (audience_type='school' and cardinality(audience_grades)=0 and cardinality(audience_club_ids)=0)
  or (audience_type='grades' and cardinality(audience_grades)>0 and audience_grades <@ array[9,10,11,12]::smallint[] and cardinality(audience_club_ids)=0)
  or (audience_type='clubs' and cardinality(audience_club_ids)>0 and cardinality(audience_grades)=0)
);

create index if not exists announcements_audience_schedule_idx
  on public.announcements(published, notifications_sent_at, publish_at)
  where archived_at is null;
create index if not exists profiles_grade_level_idx on public.profiles(grade_level) where grade_level is not null;

create or replace function public.can_read_announcement(
  p_audience_type text, p_grades smallint[], p_club_ids uuid[]
) returns boolean language sql security definer set search_path=public stable as $$
  select case
    when p_audience_type='school' then true
    when auth.uid() is null then false
    when p_audience_type='grades' then exists(
      select 1 from public.profiles p where p.id=auth.uid() and p.grade_level=any(p_grades)
    )
    when p_audience_type='clubs' then
      exists(select 1 from public.club_memberships m where m.profile_id=auth.uid() and m.status='active' and m.club_id=any(p_club_ids))
      or exists(select 1 from public.club_advisors a where a.profile_id=auth.uid() and a.club_id=any(p_club_ids))
      or exists(select 1 from public.club_officers o where o.profile_id=auth.uid() and o.club_id=any(p_club_ids)
        and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date))
    else false end;
$$;
revoke all on function public.can_read_announcement(text,smallint[],uuid[]) from public;
grant execute on function public.can_read_announcement(text,smallint[],uuid[]) to anon,authenticated;

drop policy if exists "Anyone can read published announcements" on public.announcements;
drop policy if exists "Audience reads published announcements" on public.announcements;
create policy "Audience reads published announcements" on public.announcements for select using (
  ((published and archived_at is null and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now()))
    or archived_at is not null)
  and public.can_read_announcement(audience_type,audience_grades,audience_club_ids)
);

create or replace function public.set_profile_grade(p_user_id uuid,p_grade_level smallint)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode='42501'; end if;
  if p_grade_level is not null and p_grade_level not between 9 and 12 then raise exception 'Invalid grade' using errcode='23514'; end if;
  update public.profiles set grade_level=p_grade_level where id=p_user_id;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.set_profile_grade(uuid,smallint) from public;
grant execute on function public.set_profile_grade(uuid,smallint) to authenticated;

create or replace function public.dispatch_due_announcement_notifications(p_announcement_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare a record; recipient record; delivered integer:=0;
begin
  if auth.uid() is not null and not public.is_staff_or_admin() then
    raise exception 'Staff only' using errcode='42501';
  end if;
  for a in
    select * from public.announcements
    where published and archived_at is null and notifications_sent_at is null
      and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now())
      and (notify_in_app or notify_email) and (p_announcement_id is null or id=p_announcement_id)
    for update skip locked
  loop
    for recipient in
      select distinct p.id from public.profiles p where
        a.audience_type='school'
        or (a.audience_type='grades' and p.grade_level=any(a.audience_grades))
        or (a.audience_type='clubs' and (
          exists(select 1 from public.club_memberships m where m.profile_id=p.id and m.status='active' and m.club_id=any(a.audience_club_ids))
          or exists(select 1 from public.club_advisors ca where ca.profile_id=p.id and ca.club_id=any(a.audience_club_ids))
          or exists(select 1 from public.club_officers co where co.profile_id=p.id and co.club_id=any(a.audience_club_ids)
            and (co.term_start is null or co.term_start<=current_date) and (co.term_end is null or co.term_end>=current_date))
        ))
    loop
      perform public.queue_notification(recipient.id,
        case when a.priority='emergency' then 'emergency_announcement' else 'announcement' end,
        a.title,left(a.body,500),'/announcements/'||a.id,'announcement:'||a.id,a.notify_email);
      delivered:=delivered+1;
    end loop;
    update public.announcements set notifications_sent_at=now() where id=a.id;
  end loop;
  return delivered;
end $$;
revoke all on function public.dispatch_due_announcement_notifications(uuid) from public;
grant execute on function public.dispatch_due_announcement_notifications(uuid) to authenticated,service_role;

-- Supabase Cron can call this once per minute. The guarded block avoids making
-- the migration fail when pg_cron has not been enabled for the project.
do $$ begin
  if to_regnamespace('cron') is not null and not exists(select 1 from cron.job where jobname='dispatch-announcement-notifications') then
    perform cron.schedule('dispatch-announcement-notifications','* * * * *','select public.dispatch_due_announcement_notifications();');
  end if;
end $$;

commit;

-- ============================================================================
-- 29. security_observability.sql
-- ============================================================================

-- Distributed abuse controls and production error reporting support.
-- Run after operational_intelligence.sql.
begin;

create table if not exists public.rate_limit_counters (
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, identifier_hash, window_start)
);
create index if not exists rate_limit_counters_cleanup_idx on public.rate_limit_counters(window_start);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public,anon,authenticated;

create or replace function public.check_rate_limit(p_scope text, p_identifier text default '') returns boolean
language plpgsql security definer set search_path=public as $$
declare
  max_requests integer;
  window_seconds integer;
  bucket timestamptz;
  identity text;
  current_count integer;
begin
  select limits.max_requests,limits.window_seconds into max_requests,window_seconds
  from (values
    ('search_api',60,60),
    ('analytics_api',120,60),
    ('error_report',10,300),
    ('support_submit',10,3600),
    ('announcement_submit',10,3600),
    ('event_registration',30,60),
    ('membership_action',30,60),
    ('club_application',5,86400)
  ) as limits(scope,max_requests,window_seconds)
  where limits.scope=p_scope;
  if max_requests is null then return false; end if;
  identity:=case when auth.uid() is not null then 'user:'||auth.uid()::text else 'client:'||left(coalesce(p_identifier,''),200) end;
  if auth.uid() is null and char_length(coalesce(p_identifier,''))<8 then return false; end if;
  bucket:=date_bin(make_interval(secs=>window_seconds),clock_timestamp(),timestamptz '2000-01-01');
  insert into public.rate_limit_counters(scope,identifier_hash,window_start,request_count)
  values(p_scope,md5(identity),bucket,1)
  on conflict(scope,identifier_hash,window_start) do update
    set request_count=public.rate_limit_counters.request_count+1
  returning request_count into current_count;
  if random()<0.01 then delete from public.rate_limit_counters where window_start<now()-interval '2 days'; end if;
  return current_count<=max_requests;
end $$;
revoke all on function public.check_rate_limit(text,text) from public;
grant execute on function public.check_rate_limit(text,text) to anon,authenticated;

-- Error reports remain write-only through the bounded function; Admins retain read access.
create or replace function public.record_system_error(p_source text,p_message text,p_context jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.system_errors(source,message,context)
  values(
    left(coalesce(nullif(trim(p_source),''),'application'),80),
    left(coalesce(nullif(trim(p_message),''),'Unknown error'),1000),
    jsonb_strip_nulls(coalesce(p_context,'{}')||jsonb_build_object('actor_id',auth.uid()))
  );
end $$;
revoke all on function public.record_system_error(text,text,jsonb) from public,anon;
grant execute on function public.record_system_error(text,text,jsonb) to authenticated;
drop policy if exists "Admins resolve system errors" on public.system_errors;
create policy "Admins resolve system errors" on public.system_errors for update
  using (public.is_admin()) with check (public.is_admin());
grant update(resolved_at) on public.system_errors to authenticated;

commit;

-- ============================================================================
-- 30. site_cms_workflow.sql
-- ============================================================================

-- Run after site_cms_content.sql and custom_permissions.sql.
begin;

create table if not exists public.site_content_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null references public.site_content(key) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.site_content_drafts enable row level security;
drop policy if exists "Editors own site drafts" on public.site_content_drafts;
create policy "Editors own site drafts" on public.site_content_drafts for all
using (user_id = auth.uid() and (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null)))
with check (user_id = auth.uid() and (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null)));
grant select,insert,update,delete on public.site_content_drafts to authenticated;

create table if not exists public.site_content_scheduled (
  key text primary key references public.site_content(key) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  publish_at timestamptz not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_content_scheduled enable row level security;
drop policy if exists "Public reads due site content" on public.site_content_scheduled;
drop policy if exists "Editors manage site schedule" on public.site_content_scheduled;
create policy "Public reads due site content" on public.site_content_scheduled for select using (publish_at <= now());
create policy "Editors manage site schedule" on public.site_content_scheduled for all
using (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null))
with check (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content_scheduled to anon,authenticated;
grant insert,update,delete on public.site_content_scheduled to authenticated;
drop trigger if exists site_content_scheduled_audit on public.site_content_scheduled;
create trigger site_content_scheduled_audit after insert or update or delete on public.site_content_scheduled
for each row execute function public.audit_management_change();

create table if not exists public.site_content_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null references public.site_content(key) on delete cascade,
  version_number integer not null,
  snapshot_body text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (key, version_number)
);
alter table public.site_content_versions enable row level security;
drop policy if exists "Editors read site versions" on public.site_content_versions;
create policy "Editors read site versions" on public.site_content_versions for select
using (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content_versions to authenticated;
insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
select key,1,body,updated_by from public.site_content
on conflict (key,version_number) do nothing;

create or replace function public.capture_site_content_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
  values(new.key,(select coalesce(max(version_number),0)+1 from public.site_content_versions where key=new.key),new.body,new.updated_by);
  return new;
end;
$$;
drop trigger if exists site_content_version_history on public.site_content;
create trigger site_content_version_history after insert or update on public.site_content
for each row execute function public.capture_site_content_version();

create or replace function public.capture_site_schedule_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
  values(new.key,(select coalesce(max(version_number),0)+1 from public.site_content_versions where key=new.key),new.body,new.updated_by);
  return new;
end;
$$;
drop trigger if exists site_schedule_version_history on public.site_content_scheduled;
create trigger site_schedule_version_history after insert or update on public.site_content_scheduled
for each row execute function public.capture_site_schedule_version();

commit;

-- ============================================================================
-- 31. club_membership_lifecycle.sql
-- ============================================================================

-- Recruiting controls, durable membership history, and rejection conversations.
begin;

alter table public.clubs add column if not exists recruiting_status text not null default 'recruiting';
alter table public.clubs drop constraint if exists clubs_recruiting_status_check;
alter table public.clubs add constraint clubs_recruiting_status_check check (recruiting_status in ('recruiting', 'paused', 'closed'));

alter table public.club_memberships add column if not exists rejection_reason text;
alter table public.club_memberships add column if not exists member_reply text;
alter table public.club_memberships add column if not exists ended_at timestamptz;

create table if not exists public.club_membership_history (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.club_memberships(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.capture_membership_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status or old.rejection_reason is distinct from new.rejection_reason then
    insert into public.club_membership_history(membership_id,club_id,profile_id,previous_status,new_status,reason,changed_by)
    values(new.id,new.club_id,new.profile_id,case when tg_op='INSERT' then null else old.status end,new.status,new.rejection_reason,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists club_membership_history_trigger on public.club_memberships;
create trigger club_membership_history_trigger after insert or update on public.club_memberships for each row execute function public.capture_membership_history();

alter table public.club_membership_history enable row level security;
drop policy if exists "Members and managers read membership history" on public.club_membership_history;
create policy "Members and managers read membership history" on public.club_membership_history for select
using(profile_id=auth.uid() or public.can_manage_club(club_id));

create or replace function public.reply_to_membership_decision(p_membership_id uuid,p_reply text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if length(trim(coalesce(p_reply,''))) not between 1 and 1000 then return false; end if;
  update public.club_memberships set member_reply=trim(p_reply)
  where id=p_membership_id and profile_id=auth.uid() and status='rejected';
  return found;
end $$;
revoke all on function public.reply_to_membership_decision(uuid,text) from public,anon;
grant execute on function public.reply_to_membership_decision(uuid,text) to authenticated;

create index if not exists club_membership_history_member_created_idx on public.club_membership_history(profile_id,created_at desc);
commit;

-- ============================================================================
-- 32. club_social_links.sql
-- ============================================================================

-- Repeatable public links replace the single Google Classroom code field.
create table if not exists public.club_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  platform text not null check(platform in ('google_classroom','instagram','discord','whatsapp','youtube','tiktok','website','other')),
  label text not null check(char_length(btrim(label)) between 1 and 80),
  value text not null check(char_length(btrim(value)) between 1 and 500),
  sort_order integer not null default 0 check(sort_order between 0 and 10000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_links_club_order_idx on public.club_links(club_id,sort_order,created_at);
alter table public.club_links enable row level security;
drop policy if exists "Public reads published Club links" on public.club_links;
create policy "Public reads published Club links" on public.club_links for select using(exists(select 1 from public.clubs c where c.id=club_id and (c.status='published' or public.can_manage_club(c.id))));
drop policy if exists "Managers manage Club links" on public.club_links;
create policy "Managers manage Club links" on public.club_links for all using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
grant select on public.club_links to anon,authenticated;
grant insert,update,delete on public.club_links to authenticated;

-- Preserve existing Classroom codes as the first repeatable link.
insert into public.club_links(club_id,platform,label,value,sort_order,created_by)
select id,'google_classroom','Google Classroom',google_classroom_code,0,created_by
from public.clubs c where nullif(btrim(c.google_classroom_code),'') is not null
and not exists(select 1 from public.club_links l where l.club_id=c.id and l.platform='google_classroom' and l.value=c.google_classroom_code);

-- ============================================================================
-- 33. club_member_email_invitations.sql
-- ============================================================================

-- Email invitations for students who may not have registered yet.
-- Apply after club_social_links.sql and workflow_completion.sql.
begin;

create table if not exists public.club_member_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@nycstudents[.]net$'),
  personal_message text check(personal_message is null or char_length(personal_message)<=500),
  status text not null default 'pending' check(status in('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now()+interval '30 days'),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists club_member_pending_invitation_unique
on public.club_member_invitations(club_id,email) where status='pending';
create index if not exists club_member_invitations_email_idx on public.club_member_invitations(email,status,expires_at);

create table if not exists public.club_invitation_email_outbox (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references public.club_member_invitations(id) on delete cascade,
  to_email text not null,
  subject text not null check(char_length(subject) between 1 and 200),
  html_body text not null,
  text_body text not null,
  status text not null default 'pending' check(status in('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.club_member_invitations enable row level security;
alter table public.club_invitation_email_outbox enable row level security;
drop policy if exists "Managers manage Club member invitations" on public.club_member_invitations;
drop policy if exists "Managers manage Club invitation emails" on public.club_invitation_email_outbox;
create policy "Managers manage Club member invitations" on public.club_member_invitations for all
using(public.can_govern_club(club_id)) with check(public.can_govern_club(club_id) and invited_by=auth.uid());
create policy "Managers manage Club invitation emails" on public.club_invitation_email_outbox for all
using(exists(select 1 from public.club_member_invitations invitation where invitation.id=invitation_id and public.can_govern_club(invitation.club_id)))
with check(exists(select 1 from public.club_member_invitations invitation where invitation.id=invitation_id and public.can_govern_club(invitation.club_id)));
grant select,insert,update on public.club_member_invitations to authenticated;
grant select,insert,update on public.club_invitation_email_outbox to authenticated;
grant usage,select on sequence public.club_invitation_email_outbox_id_seq to authenticated;

create or replace function public.claim_pending_club_member_invitations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role<>'student' or lower(coalesce(new.email,'')) not like '%@nycstudents.net' then return new; end if;
  insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
  select distinct invitation.club_id,new.id,'active',now()
  from public.club_member_invitations invitation
  where invitation.email=lower(btrim(new.email)) and invitation.status='pending' and invitation.expires_at>now()
  on conflict(club_id,profile_id) do update set status='active',reviewed_at=now(),ended_at=null,rejection_reason=null;
  update public.club_member_invitations set status='accepted',claimed_profile_id=new.id,claimed_at=now()
  where email=lower(btrim(new.email)) and status='pending' and expires_at>now();
  update public.club_member_invitations set status='expired' where email=lower(btrim(new.email)) and status='pending' and expires_at<=now();
  return new;
end $$;
revoke all on function public.claim_pending_club_member_invitations() from public,anon,authenticated;
drop trigger if exists claim_pending_club_member_invitations on public.profiles;
create trigger claim_pending_club_member_invitations after insert or update of email,role on public.profiles
for each row execute function public.claim_pending_club_member_invitations();

create or replace function public.claim_club_member_invitation_for_existing_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare student_id uuid;
begin
  if new.status<>'pending' or new.expires_at<=now() then return new; end if;
  select id into student_id from public.profiles where email=new.email and role='student';
  if student_id is null then return new; end if;
  insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
  values(new.club_id,student_id,'active',now())
  on conflict(club_id,profile_id) do update set status='active',reviewed_at=now(),ended_at=null,rejection_reason=null;
  update public.club_member_invitations set status='accepted',claimed_profile_id=student_id,claimed_at=now() where id=new.id;
  return new;
end $$;
revoke all on function public.claim_club_member_invitation_for_existing_account() from public,anon,authenticated;
drop trigger if exists claim_club_member_invitation_for_existing_account on public.club_member_invitations;
create trigger claim_club_member_invitation_for_existing_account after insert or update of email,status,expires_at on public.club_member_invitations
for each row execute function public.claim_club_member_invitation_for_existing_account();

create or replace function public.claim_club_invitation_emails(p_limit integer default 25)
returns setof public.club_invitation_email_outbox language plpgsql security definer set search_path=public as $$
begin
  return query
  update public.club_invitation_email_outbox outbox set status='sending',attempts=attempts+1,claimed_at=now()
  where outbox.id in (
    select candidate.id from public.club_invitation_email_outbox candidate
    join public.club_member_invitations invitation on invitation.id=candidate.invitation_id
    where candidate.status in('pending','failed') and candidate.available_at<=now() and candidate.attempts<5
      and invitation.status in('pending','accepted')
    order by candidate.available_at,candidate.id for update skip locked limit least(greatest(p_limit,1),100)
  ) returning outbox.*;
end $$;
revoke all on function public.claim_club_invitation_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_club_invitation_emails(integer) to service_role;

commit;

-- ============================================================================
-- 34. club_media_library.sql
-- ============================================================================

-- Club media library, placements, and announcement image review.
-- Apply after core_platform.sql and account_roles_and_review.sql.

begin;

alter table public.club_media add column if not exists visibility text;
update public.club_media set visibility = 'gallery' where visibility is null;
alter table public.club_media alter column visibility set default 'private';
alter table public.club_media alter column visibility set not null;
alter table public.club_media drop constraint if exists club_media_visibility_check;
alter table public.club_media add constraint club_media_visibility_check check (visibility in ('private', 'gallery'));
alter table public.club_media add column if not exists is_cover boolean not null default false;
create unique index if not exists club_media_one_cover_idx on public.club_media (club_id) where is_cover;

alter table public.club_announcements add column if not exists media_id uuid references public.club_media(id) on delete restrict;
alter table public.school_announcement_submissions add column if not exists media_id uuid references public.club_media(id) on delete restrict;
alter table public.announcements add column if not exists media_id uuid references public.club_media(id) on delete restrict;

drop policy if exists "Public reads club media" on public.club_media;
create policy "Public reads club media" on public.club_media for select using (
  public.can_manage_club(club_media.club_id)
  or exists (select 1 from public.clubs c where c.id = club_media.club_id and c.status = 'published')
  and (
    club_media.visibility = 'gallery' or club_media.is_cover
    or exists (select 1 from public.club_announcements ca where ca.media_id = club_media.id and ca.published)
    or exists (select 1 from public.announcements a where a.media_id = club_media.id and a.published)
  )
);

drop policy if exists "Club leaders submit for review" on public.school_announcement_submissions;
create policy "Club leaders submit for review" on public.school_announcement_submissions for insert with check (
  author_id = auth.uid() and public.can_manage_club(club_id) and status = 'pending'
  and reviewed_by is null and reviewed_at is null and announcement_id is null and review_note is null
  and (school_announcement_submissions.media_id is null or exists (
    select 1 from public.club_media m
    where m.id = school_announcement_submissions.media_id and m.club_id = school_announcement_submissions.club_id
  ))
);

create or replace function public.review_school_announcement(p_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare submission public.school_announcement_submissions; published_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  select * into submission from public.school_announcement_submissions where id=p_id for update;
  if not found or submission.status <> 'pending' then raise exception 'Submission is no longer pending'; end if;
  if not p_approve and char_length(btrim(coalesce(p_note,''))) < 3 then raise exception 'Give a rejection reason'; end if;
  if submission.media_id is not null and not exists (
    select 1 from public.club_media m where m.id = submission.media_id and m.club_id = submission.club_id
  ) then raise exception 'Selected image is no longer available'; end if;
  if p_approve then
    insert into public.announcements(title,body,tag,created_by,published,media_id)
    values(submission.title,submission.body,'Announcements',submission.author_id,true,submission.media_id)
    returning id into published_id;
  end if;
  update public.school_announcement_submissions
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,2000),announcement_id=published_id
  where id=p_id;
end $$;

revoke all on function public.review_school_announcement(uuid,boolean,text) from public,anon;
grant execute on function public.review_school_announcement(uuid,boolean,text) to authenticated;

commit;

-- ============================================================================
-- 35. club_media_processing.sql
-- ============================================================================

-- Processed image variants, accessibility requirements, and sharing permission records.
-- Apply after club_media_library.sql.
begin;

alter table public.club_media add column if not exists medium_path text;
alter table public.club_media add column if not exists thumbnail_path text;
alter table public.club_media add column if not exists image_width integer check (image_width is null or image_width between 1 and 12000);
alter table public.club_media add column if not exists image_height integer check (image_height is null or image_height between 1 and 12000);
alter table public.club_media add column if not exists file_size integer check (file_size is null or file_size between 1 and 4194304);
alter table public.club_media add column if not exists permission_basis text
  check (permission_basis is null or permission_basis in ('no_people','school_approved','participant_consent','guardian_consent','legacy_review_required'));
alter table public.club_media add column if not exists permission_note text check (char_length(permission_note) <= 500);
alter table public.club_media add column if not exists permission_confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.club_media add column if not exists permission_confirmed_at timestamptz;

-- Existing public media remains available, but is clearly marked for review.
update public.club_media
set permission_basis = 'legacy_review_required'
where permission_basis is null and (visibility = 'gallery' or is_cover);

create or replace function public.validate_club_media_publication()
returns trigger language plpgsql set search_path=public as $$
begin
  -- Allow an existing unverified cover to be demoted without treating that
  -- safety improvement as a new publication. Any other edit must add evidence.
  if tg_op = 'UPDATE' and old.permission_basis = 'legacy_review_required'
     and new.permission_basis = 'legacy_review_required'
     and old.is_cover and not new.is_cover and new.visibility = old.visibility then
    return new;
  end if;
  if new.visibility = 'gallery' or new.is_cover then
    if char_length(btrim(coalesce(new.alt_text,''))) < 10
       or lower(btrim(new.alt_text)) in ('image','photo','picture','club photo','club image','untitled') then
      raise exception 'Public images require meaningful alternative text' using errcode='23514';
    end if;
    if new.permission_basis not in ('no_people','school_approved','participant_consent','guardian_consent')
       or new.permission_confirmed_by is null or new.permission_confirmed_at is null then
      raise exception 'Public images require a confirmed sharing permission record' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists club_media_publication_guard on public.club_media;
create trigger club_media_publication_guard before insert or update on public.club_media
for each row execute function public.validate_club_media_publication();

commit;

-- ============================================================================
-- 36. club_constitution_elections.sql
-- ============================================================================

-- Constitution versioning and Club officer election planning.
-- Safe to apply to both new and existing Hatchx databases.
begin;

create table if not exists public.club_constitution_versions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  body text not null check (char_length(btrim(body)) >= 50),
  change_summary text not null check (char_length(btrim(change_summary)) >= 5),
  adopted_on date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (club_id, version_number)
);

create table if not exists public.club_elections (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(btrim(title)) >= 3),
  election_date date not null,
  positions text[] not null default '{}',
  status text not null default 'planned' check (status in ('planned','open','completed','cancelled')),
  result_summary text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.club_elections add column if not exists opens_at timestamptz;
alter table public.club_elections add column if not exists closes_at timestamptz;
alter table public.club_elections add column if not exists results_locked_at timestamptz;

alter table public.club_constitution_versions enable row level security;
alter table public.club_elections enable row level security;

drop policy if exists "Board reads constitutions" on public.club_constitution_versions;
drop policy if exists "Board adds constitution versions" on public.club_constitution_versions;
drop policy if exists "Public reads published Club constitutions" on public.club_constitution_versions;
drop policy if exists "Board manages elections" on public.club_elections;

create policy "Board reads constitutions"
on public.club_constitution_versions for select
using (public.can_manage_club(club_id));

create policy "Board adds constitution versions"
on public.club_constitution_versions for insert
with check (public.can_manage_club(club_id) and created_by = auth.uid());

create policy "Public reads published Club constitutions"
on public.club_constitution_versions for select
using (exists (select 1 from public.clubs club where club.id = club_id and club.status = 'published'));

create policy "Board manages elections"
on public.club_elections for all
using (public.can_manage_club(club_id))
with check (public.can_manage_club(club_id));

create index if not exists club_constitution_versions_club_version_idx
on public.club_constitution_versions(club_id, version_number desc);

create index if not exists club_elections_club_date_idx
on public.club_elections(club_id, election_date desc);

commit;

-- ============================================================================
-- 37. club_finance.sql
-- ============================================================================

-- Club fundraising and append-only finance ledger. Apply after club_governance.sql.
begin;

create table if not exists public.club_fundraisers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  school_year text not null check(school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  title text not null check(char_length(btrim(title)) between 3 and 120),
  purpose text not null check(char_length(btrim(purpose)) between 10 and 2000),
  target_cents integer not null check(target_cents between 1 and 999999999),
  planned_start date not null,
  planned_end date not null check(planned_end >= planned_start),
  status text not null default 'pending_treasurer' check(status in ('pending_treasurer','approved','rejected','final_statement_due','closed')),
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text,
  final_statement_due_at date generated always as(planned_end + 30) stored,
  final_statement text, proceeds_cents integer check(proceeds_cents >= 0), expenses_cents integer check(expenses_cents >= 0),
  closed_by uuid references public.profiles(id), closed_at timestamptz
);

create table if not exists public.club_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  school_year text not null check(school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  entry_type text not null check(entry_type in ('income','expense')),
  amount_cents integer not null check(amount_cents between 1 and 999999999),
  category text not null check(char_length(btrim(category)) between 2 and 80),
  description text not null check(char_length(btrim(description)) between 3 and 1000),
  occurred_on date not null,
  receipt_reference text check(receipt_reference is null or char_length(receipt_reference) <= 500),
  fundraiser_id uuid references public.club_fundraisers(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists club_fundraisers_club_status_idx on public.club_fundraisers(club_id,status,planned_start);
create index if not exists club_finance_transactions_club_date_idx on public.club_finance_transactions(club_id,occurred_on desc,created_at desc);

create or replace function public.can_approve_club_finance(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_govern_club(p_club_id) or exists(select 1 from public.club_officers o where o.club_id=p_club_id and o.profile_id=auth.uid() and lower(o.title) like '%treasurer%' and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date));
$$;

alter table public.club_fundraisers enable row level security;
alter table public.club_finance_transactions enable row level security;
drop policy if exists "Board reads club fundraisers" on public.club_fundraisers;
drop policy if exists "Board submits club fundraisers" on public.club_fundraisers;
drop policy if exists "Board reads club ledger" on public.club_finance_transactions;
drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;
create policy "Board reads club fundraisers" on public.club_fundraisers for select using(public.can_manage_club(club_id));
create policy "Board submits club fundraisers" on public.club_fundraisers for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid() and status='pending_treasurer');
create policy "Board reads club ledger" on public.club_finance_transactions for select using(public.can_manage_club(club_id));
create policy "Staff records club ledger" on public.club_finance_transactions for insert with check(public.is_staff_or_admin() and created_by=auth.uid());

create or replace function public.review_club_fundraiser(p_fundraiser_id uuid,p_approve boolean,p_note text) returns boolean language plpgsql security definer set search_path=public as $$ declare target public.club_fundraisers; begin select * into target from public.club_fundraisers where id=p_fundraiser_id for update; if target.id is null or not public.can_approve_club_finance(target.club_id) or target.status<>'pending_treasurer' then return false; end if; if char_length(btrim(coalesce(p_note,'')))>1000 then return false; end if; update public.club_fundraisers set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_fundraiser_id; return true; end $$;
create or replace function public.close_club_fundraiser(p_fundraiser_id uuid,p_statement text,p_proceeds_cents integer,p_expenses_cents integer) returns boolean language plpgsql security definer set search_path=public as $$ declare target public.club_fundraisers; begin select * into target from public.club_fundraisers where id=p_fundraiser_id for update; if target.id is null or not public.can_manage_club(target.club_id) or target.status not in ('approved','final_statement_due') or char_length(btrim(coalesce(p_statement,''))) not between 10 and 4000 or p_proceeds_cents<0 or p_expenses_cents<0 then return false; end if; update public.club_fundraisers set status='closed',final_statement=btrim(p_statement),proceeds_cents=p_proceeds_cents,expenses_cents=p_expenses_cents,closed_by=auth.uid(),closed_at=now() where id=p_fundraiser_id; return true; end $$;
revoke all on function public.can_approve_club_finance(uuid),public.review_club_fundraiser(uuid,boolean,text),public.close_club_fundraiser(uuid,text,integer,integer) from public;
grant execute on function public.can_approve_club_finance(uuid),public.review_club_fundraiser(uuid,boolean,text),public.close_club_fundraiser(uuid,text,integer,integer) to authenticated;

do $$ begin
  if to_regprocedure('public.log_club_change()') is not null then
    drop trigger if exists audit_club_change on public.club_fundraisers;
    create trigger audit_club_change after insert or update or delete on public.club_fundraisers for each row execute function public.log_club_change();
    drop trigger if exists audit_club_change on public.club_finance_transactions;
    create trigger audit_club_change after insert or update or delete on public.club_finance_transactions for each row execute function public.log_club_change();
  end if;
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists club_fundraisers_global_audit on public.club_fundraisers;
    create trigger club_fundraisers_global_audit after insert or update or delete on public.club_fundraisers for each row execute function public.audit_management_change();
    drop trigger if exists club_finance_transactions_global_audit on public.club_finance_transactions;
    create trigger club_finance_transactions_global_audit after insert or update or delete on public.club_finance_transactions for each row execute function public.audit_management_change();
  end if;
end $$;
commit;

-- ============================================================================
-- 38. finance_permissions_and_reimbursements.sql
-- ============================================================================

-- Staff-only treasury writes plus private, multi-file reimbursement tickets.
-- Run after club_finance.sql, school_operations.sql, and workflow_completion.sql.
begin;

alter table public.club_finance_transactions
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz;

drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff updates club ledger" on public.club_finance_transactions;
create policy "Staff records club ledger" on public.club_finance_transactions for insert
with check(public.is_staff_or_admin() and created_by=auth.uid());
create policy "Staff updates club ledger" on public.club_finance_transactions for update
using(public.is_staff_or_admin())
with check(public.is_staff_or_admin() and updated_by=auth.uid());
grant update on public.club_finance_transactions to authenticated;

drop policy if exists "Board submits club fundraisers" on public.club_fundraisers;
drop policy if exists "Staff manages club fundraisers" on public.club_fundraisers;
create policy "Staff manages club fundraisers" on public.club_fundraisers for all
using(public.is_staff_or_admin())
with check(public.is_staff_or_admin());

create or replace function public.can_approve_club_finance(p_club_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_staff_or_admin();
$$;
create or replace function public.review_club_fundraiser(p_fundraiser_id uuid,p_approve boolean,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare target public.club_fundraisers;
begin
  select * into target from public.club_fundraisers where id=p_fundraiser_id for update;
  if target.id is null or not public.is_staff_or_admin() or target.status<>'pending_treasurer' then return false; end if;
  if char_length(btrim(coalesce(p_note,'')))>1000 then return false; end if;
  update public.club_fundraisers set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_fundraiser_id;
  return true;
end $$;
create or replace function public.close_club_fundraiser(p_fundraiser_id uuid,p_statement text,p_proceeds_cents integer,p_expenses_cents integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare target public.club_fundraisers;
begin
  select * into target from public.club_fundraisers where id=p_fundraiser_id for update;
  if target.id is null or not public.is_staff_or_admin() or target.status not in ('approved','final_statement_due')
    or char_length(btrim(coalesce(p_statement,''))) not between 10 and 4000
    or p_proceeds_cents<0 or p_expenses_cents<0 then return false; end if;
  update public.club_fundraisers set status='closed',final_statement=btrim(p_statement),
    proceeds_cents=p_proceeds_cents,expenses_cents=p_expenses_cents,closed_by=auth.uid(),closed_at=now()
    where id=p_fundraiser_id;
  return true;
end $$;

drop policy if exists "Governors manage budgets" on public.club_budgets;
drop policy if exists "Staff manages budgets" on public.club_budgets;
create policy "Staff manages budgets" on public.club_budgets for all
using(public.is_staff_or_admin()) with check(public.is_staff_or_admin());

drop policy if exists "Governors review reimbursements" on public.club_reimbursements;
drop policy if exists "Staff reviews reimbursements" on public.club_reimbursements;
drop policy if exists "Submitters remove pending reimbursements" on public.club_reimbursements;
create policy "Staff reviews reimbursements" on public.club_reimbursements for update
using(public.is_staff_or_admin()) with check(public.is_staff_or_admin());
create policy "Submitters remove pending reimbursements" on public.club_reimbursements for delete
using(submitted_by=auth.uid() and status='pending');

create table if not exists public.club_reimbursement_attachments(
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.club_reimbursements(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check(char_length(file_name) between 1 and 180),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  file_size integer not null check(file_size between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists reimbursement_attachments_ticket_idx
  on public.club_reimbursement_attachments(reimbursement_id,created_at);
alter table public.club_reimbursement_attachments enable row level security;
drop policy if exists "Club managers read reimbursement attachments" on public.club_reimbursement_attachments;
drop policy if exists "Submitters add reimbursement attachments" on public.club_reimbursement_attachments;
create policy "Club managers read reimbursement attachments" on public.club_reimbursement_attachments for select
using(exists(select 1 from public.club_reimbursements r where r.id=reimbursement_id and public.can_manage_club(r.club_id)));
create policy "Submitters add reimbursement attachments" on public.club_reimbursement_attachments for insert
with check(uploaded_by=auth.uid() and exists(select 1 from public.club_reimbursements r
  where r.id=reimbursement_id and r.submitted_by=auth.uid() and r.status='pending'));
grant select,insert on public.club_reimbursement_attachments to authenticated;

drop policy if exists "Club managers upload receipts" on storage.objects;
drop policy if exists "Club governors read receipts" on storage.objects;
drop policy if exists "Club managers read receipts" on storage.objects;
drop policy if exists "Receipt owners remove failed uploads" on storage.objects;
create policy "Club managers upload receipts" on storage.objects for insert to authenticated
with check(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Club managers read receipts" on storage.objects for select to authenticated
using(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Receipt owners remove failed uploads" on storage.objects for delete to authenticated
using(bucket_id='club-receipts' and owner_id=auth.uid()::text);

do $$ begin
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists club_reimbursement_attachments_global_audit on public.club_reimbursement_attachments;
    create trigger club_reimbursement_attachments_global_audit after insert or update or delete
      on public.club_reimbursement_attachments for each row execute function public.audit_management_change();
  end if;
end $$;

commit;

-- ============================================================================
-- 39. finance_ledger_staff_only.sql
-- ============================================================================

-- Restrict manually recorded money movements to Staff and Admin accounts.
-- Club boards and treasurers retain read access and use the fundraiser and
-- reimbursement workflows instead of writing directly to the official ledger.
begin;

drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;

create policy "Staff records club ledger"
on public.club_finance_transactions
for insert
with check (public.is_staff_or_admin() and created_by = auth.uid());

commit;

-- ============================================================================
-- 40. club_custom_tables.sql
-- ============================================================================

-- Club-scoped custom tables and rows. Run after custom_permissions.sql.
begin;

create table if not exists public.club_custom_tables (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 2 and 80),
  description text check(description is null or char_length(description) <= 500),
  columns jsonb not null check(jsonb_typeof(columns)='array' and jsonb_array_length(columns) between 1 and 30),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(club_id,name)
);

create table if not exists public.club_custom_table_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.club_custom_tables(id) on delete cascade,
  data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index if not exists club_custom_tables_club_idx on public.club_custom_tables(club_id,created_at);
create index if not exists club_custom_table_rows_table_idx on public.club_custom_table_rows(table_id,created_at desc);
alter table public.club_custom_tables enable row level security;
alter table public.club_custom_table_rows enable row level security;

create or replace function public.validate_club_custom_table_columns() returns trigger
language plpgsql security definer set search_path=public as $$
declare item jsonb; option_value jsonb; seen text[] := '{}'; label_seen text[] := '{}'; option_seen text[];
begin
  for item in select value from jsonb_array_elements(new.columns) loop
    if jsonb_typeof(item)<>'object'
      or coalesce(item->>'key','') !~ '^column_[1-9][0-9]*$'
      or char_length(btrim(coalesce(item->>'label',''))) not between 1 and 80
      or coalesce(item->>'type','') not in ('text','long_text','number','date','checkbox','email','url','select')
      or coalesce(jsonb_typeof(item->'required'),'') <> 'boolean'
      or lower(btrim(item->>'label'))=any(label_seen)
      or item->>'key'=any(seen) then
      raise exception 'Invalid custom table column definition' using errcode='23514';
    end if;
    if item->>'type'='select' then
      if coalesce(jsonb_typeof(item->'options'),'')<>'array' or jsonb_array_length(item->'options') not between 1 and 50 then
        raise exception 'Select columns require 1 to 50 options' using errcode='23514';
      end if;
      option_seen:='{}';
      for option_value in select value from jsonb_array_elements(item->'options') loop
        if jsonb_typeof(option_value)<>'string' or char_length(btrim(option_value#>>'{}')) not between 1 and 100 or lower(option_value#>>'{}')=any(option_seen) then
          raise exception 'Select options must be unique text values' using errcode='23514';
        end if;
        option_seen:=array_append(option_seen,lower(option_value#>>'{}'));
      end loop;
    end if;
    seen := array_append(seen,item->>'key');
    label_seen := array_append(label_seen,lower(btrim(item->>'label')));
  end loop;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_columns() from public,anon,authenticated;
drop trigger if exists validate_club_custom_table_columns on public.club_custom_tables;
create trigger validate_club_custom_table_columns before insert or update of columns on public.club_custom_tables
for each row execute function public.validate_club_custom_table_columns();

create or replace function public.validate_club_custom_table_row() returns trigger
language plpgsql security definer set search_path=public as $$
declare definitions jsonb; item jsonb; cell jsonb; allowed text[] := '{}'; text_value text;
begin
  select columns into definitions from public.club_custom_tables where id=new.table_id;
  if definitions is null then raise exception 'Custom table not found' using errcode='23503'; end if;
  for item in select value from jsonb_array_elements(definitions) loop
    allowed := array_append(allowed,item->>'key');
    cell := new.data->(item->>'key'); text_value:=cell#>>'{}';
    if coalesce((item->>'required')::boolean,false) and (cell is null or cell='""'::jsonb) and item->>'type'<>'checkbox' then
      raise exception 'Required custom table value is missing' using errcode='23514';
    end if;
    if cell is not null and not (
      (item->>'type' in ('text','long_text','date','email','url','select') and jsonb_typeof(cell)='string')
      or (item->>'type'='number' and (jsonb_typeof(cell)='number' or cell='""'::jsonb))
      or (item->>'type'='checkbox' and jsonb_typeof(cell)='boolean')
    ) then raise exception 'Custom table value has the wrong type' using errcode='23514'; end if;
    if jsonb_typeof(cell)='string' and char_length(text_value)>2000 then raise exception 'Custom table value is too long' using errcode='23514'; end if;
    if item->>'type'='date' and coalesce(text_value,'')<>'' and text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date value' using errcode='23514'; end if;
    if item->>'type'='email' and coalesce(text_value,'')<>'' and text_value !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email value' using errcode='23514'; end if;
    if item->>'type'='url' and coalesce(text_value,'')<>'' and text_value !~* '^https://[^[:space:]]+$' then raise exception 'Invalid URL value' using errcode='23514'; end if;
    if item->>'type'='select' and coalesce(text_value,'')<>'' and not (item->'options' ? text_value) then raise exception 'Invalid select option' using errcode='23514'; end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(new.data) key where not key=any(allowed)) then
    raise exception 'Unknown custom table column' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_row() from public,anon,authenticated;
drop trigger if exists validate_club_custom_table_row on public.club_custom_table_rows;
create trigger validate_club_custom_table_row before insert or update on public.club_custom_table_rows
for each row execute function public.validate_club_custom_table_row();

drop policy if exists "Club managers manage custom tables" on public.club_custom_tables;
drop policy if exists "Club managers read custom tables" on public.club_custom_tables;
drop policy if exists "Club managers create custom tables" on public.club_custom_tables;
drop policy if exists "Club managers delete custom tables" on public.club_custom_tables;
create policy "Club managers read custom tables" on public.club_custom_tables for select using(public.can_manage_club(club_id));
create policy "Club managers create custom tables" on public.club_custom_tables for insert with check(public.can_manage_club(club_id) and created_by=auth.uid());
create policy "Club managers delete custom tables" on public.club_custom_tables for delete using(public.can_manage_club(club_id));

drop policy if exists "Club managers manage custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers read custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers create custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers delete custom rows" on public.club_custom_table_rows;
create policy "Club managers read custom rows" on public.club_custom_table_rows for select
using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)));
create policy "Club managers create custom rows" on public.club_custom_table_rows for insert
with check(created_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)));
create policy "Club managers delete custom rows" on public.club_custom_table_rows for delete
using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)));

grant select,insert,delete on public.club_custom_tables,public.club_custom_table_rows to authenticated;

do $$ begin
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists club_custom_tables_global_audit on public.club_custom_tables;
    create trigger club_custom_tables_global_audit after insert or update or delete on public.club_custom_tables
      for each row execute function public.audit_management_change();
    drop trigger if exists club_custom_table_rows_global_audit on public.club_custom_table_rows;
    create trigger club_custom_table_rows_global_audit after insert or update or delete on public.club_custom_table_rows
      for each row execute function public.audit_management_change();
  end if;
end $$;

commit;

-- ============================================================================
-- 41. club_custom_tables_enhancements.sql
-- ============================================================================

-- Editing and richer field types for Club custom tables.
-- Run after club_custom_tables.sql.
begin;

create or replace function public.validate_club_custom_table_columns() returns trigger
language plpgsql security definer set search_path=public as $$
declare item jsonb; option_value jsonb; seen text[] := '{}'; label_seen text[] := '{}'; option_seen text[];
begin
  for item in select value from jsonb_array_elements(new.columns) loop
    if jsonb_typeof(item)<>'object'
      or coalesce(item->>'key','') !~ '^column_[1-9][0-9]*$'
      or char_length(btrim(coalesce(item->>'label',''))) not between 1 and 80
      or coalesce(item->>'type','') not in ('text','long_text','number','date','checkbox','email','url','select')
      or coalesce(jsonb_typeof(item->'required'),'') <> 'boolean'
      or lower(btrim(item->>'label'))=any(label_seen)
      or item->>'key'=any(seen) then
      raise exception 'Invalid custom table column definition' using errcode='23514';
    end if;
    if item->>'type'='select' then
      if coalesce(jsonb_typeof(item->'options'),'')<>'array' or jsonb_array_length(item->'options') not between 1 and 50 then
        raise exception 'Select columns require 1 to 50 options' using errcode='23514';
      end if;
      option_seen:='{}';
      for option_value in select value from jsonb_array_elements(item->'options') loop
        if jsonb_typeof(option_value)<>'string' or char_length(btrim(option_value#>>'{}')) not between 1 and 100 or lower(option_value#>>'{}')=any(option_seen) then
          raise exception 'Select options must be unique text values' using errcode='23514';
        end if;
        option_seen:=array_append(option_seen,lower(option_value#>>'{}'));
      end loop;
    end if;
    seen:=array_append(seen,item->>'key');
    label_seen:=array_append(label_seen,lower(btrim(item->>'label')));
  end loop;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_columns() from public,anon,authenticated;

create or replace function public.validate_club_custom_table_row() returns trigger
language plpgsql security definer set search_path=public as $$
declare definitions jsonb; item jsonb; cell jsonb; allowed text[] := '{}'; text_value text;
begin
  select columns into definitions from public.club_custom_tables where id=new.table_id;
  if definitions is null then raise exception 'Custom table not found' using errcode='23503'; end if;
  for item in select value from jsonb_array_elements(definitions) loop
    allowed:=array_append(allowed,item->>'key'); cell:=new.data->(item->>'key'); text_value:=cell#>>'{}';
    if coalesce((item->>'required')::boolean,false) and (cell is null or cell='""'::jsonb) and item->>'type'<>'checkbox' then raise exception 'Required custom table value is missing' using errcode='23514'; end if;
    if cell is not null and not (
      (item->>'type' in ('text','long_text','date','email','url','select') and jsonb_typeof(cell)='string')
      or (item->>'type'='number' and (jsonb_typeof(cell)='number' or cell='""'::jsonb))
      or (item->>'type'='checkbox' and jsonb_typeof(cell)='boolean')
    ) then raise exception 'Custom table value has the wrong type' using errcode='23514'; end if;
    if jsonb_typeof(cell)='string' and char_length(text_value)>2000 then raise exception 'Custom table value is too long' using errcode='23514'; end if;
    if item->>'type'='date' and coalesce(text_value,'')<>'' and text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date value' using errcode='23514'; end if;
    if item->>'type'='email' and coalesce(text_value,'')<>'' and text_value !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email value' using errcode='23514'; end if;
    if item->>'type'='url' and coalesce(text_value,'')<>'' and text_value !~* '^https://[^[:space:]]+$' then raise exception 'Invalid URL value' using errcode='23514'; end if;
    if item->>'type'='select' and coalesce(text_value,'')<>'' and not (item->'options' ? text_value) then raise exception 'Invalid select option' using errcode='23514'; end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(new.data) key where not key=any(allowed)) then raise exception 'Unknown custom table column' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_row() from public,anon,authenticated;

drop policy if exists "Club managers update custom tables" on public.club_custom_tables;
create policy "Club managers update custom tables" on public.club_custom_tables for update
using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
drop policy if exists "Club managers update custom rows" on public.club_custom_table_rows;
create policy "Club managers update custom rows" on public.club_custom_table_rows for update
using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)))
with check(updated_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)));
grant update on public.club_custom_tables,public.club_custom_table_rows to authenticated;

drop trigger if exists club_custom_tables_touch_updated_at on public.club_custom_tables;
create trigger club_custom_tables_touch_updated_at before update on public.club_custom_tables for each row execute function public.touch_updated_at();
drop trigger if exists club_custom_table_rows_touch_updated_at on public.club_custom_table_rows;
create trigger club_custom_table_rows_touch_updated_at before update on public.club_custom_table_rows for each row execute function public.touch_updated_at();

commit;

-- ============================================================================
-- 42. club_custom_forms_sharing.sql
-- ============================================================================

-- Public Custom form links with board-only administration and response access.
-- Run after club_custom_tables.sql and club_custom_tables_enhancements.sql.
begin;

create extension if not exists pgcrypto;

create or replace function public.can_manage_club_forms(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
  exists(select 1 from public.club_officers o where o.club_id=p_club_id and o.profile_id=auth.uid()
   and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date))
  or exists(select 1 from public.club_advisors a where a.club_id=p_club_id and a.profile_id=auth.uid())
 );
$$;
revoke all on function public.can_manage_club_forms(uuid) from public,anon;
grant execute on function public.can_manage_club_forms(uuid) to authenticated;

alter table public.club_custom_table_rows alter column created_by drop not null;

create table if not exists public.club_custom_form_links(
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null references public.club_custom_tables(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz,
 active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists club_custom_form_links_table_idx on public.club_custom_form_links(table_id,created_at desc);
alter table public.club_custom_form_links enable row level security;
drop policy if exists "Board manages form links" on public.club_custom_form_links;
drop policy if exists "Board reads form links" on public.club_custom_form_links;
drop policy if exists "Board creates form links" on public.club_custom_form_links;
drop policy if exists "Board updates form links" on public.club_custom_form_links;
drop policy if exists "Board deletes form links" on public.club_custom_form_links;
create policy "Board reads form links" on public.club_custom_form_links for select using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board creates form links" on public.club_custom_form_links for insert with check(created_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board updates form links" on public.club_custom_form_links for update using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id))) with check(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board deletes form links" on public.club_custom_form_links for delete using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
grant select,insert,update,delete on public.club_custom_form_links to authenticated;

drop policy if exists "Club managers read custom tables" on public.club_custom_tables;
drop policy if exists "Club managers create custom tables" on public.club_custom_tables;
drop policy if exists "Club managers update custom tables" on public.club_custom_tables;
drop policy if exists "Club managers delete custom tables" on public.club_custom_tables;
drop policy if exists "Board reads custom tables" on public.club_custom_tables;
drop policy if exists "Board creates custom tables" on public.club_custom_tables;
drop policy if exists "Board updates custom tables" on public.club_custom_tables;
drop policy if exists "Board deletes custom tables" on public.club_custom_tables;
create policy "Board reads custom tables" on public.club_custom_tables for select using(public.can_manage_club_forms(club_id));
create policy "Board creates custom tables" on public.club_custom_tables for insert with check(public.can_manage_club_forms(club_id) and created_by=auth.uid());
create policy "Board updates custom tables" on public.club_custom_tables for update using(public.can_manage_club_forms(club_id)) with check(public.can_manage_club_forms(club_id));
create policy "Board deletes custom tables" on public.club_custom_tables for delete using(public.can_manage_club_forms(club_id));

drop policy if exists "Club managers read custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers create custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers update custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers delete custom rows" on public.club_custom_table_rows;
drop policy if exists "Board reads custom rows" on public.club_custom_table_rows;
drop policy if exists "Board creates custom rows" on public.club_custom_table_rows;
drop policy if exists "Board updates custom rows" on public.club_custom_table_rows;
drop policy if exists "Board deletes custom rows" on public.club_custom_table_rows;
create policy "Board reads custom rows" on public.club_custom_table_rows for select using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board creates custom rows" on public.club_custom_table_rows for insert with check(created_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board updates custom rows" on public.club_custom_table_rows for update using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id))) with check(updated_by=auth.uid());
create policy "Board deletes custom rows" on public.club_custom_table_rows for delete using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));

create or replace function public.get_public_custom_form(p_token text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'columns',t.columns,'club_name',c.name)
 from public.club_custom_form_links l join public.club_custom_tables t on t.id=l.table_id join public.clubs c on c.id=t.club_id
 where l.token_hash=encode(digest(p_token,'sha256'),'hex') and l.active and (l.expires_at is null or l.expires_at>now())
 limit 1;
$$;

create or replace function public.submit_public_custom_form(p_token text,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_table uuid; result_id uuid;
begin
 select l.table_id into target_table from public.club_custom_form_links l
 where l.token_hash=encode(digest(p_token,'sha256'),'hex') and l.active and (l.expires_at is null or l.expires_at>now()) for update;
 if target_table is null then raise exception 'Form link is invalid or expired' using errcode='P0002'; end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid response' using errcode='23514'; end if;
 insert into public.club_custom_table_rows(table_id,data,created_by) values(target_table,p_data,null) returning id into result_id;
 return result_id;
end $$;
revoke all on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) from public;
grant execute on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) to anon,authenticated;

commit;

-- ============================================================================
-- 43. teacher_club_application_workflow.sql
-- ============================================================================

-- Teacher-led Club creation: teachers apply, Admins decide, approval publishes
-- the Club and assigns the submitting teacher as its first Advisor.

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;
revoke all on function public.is_teacher() from public, anon, authenticated;
grant execute on function public.is_teacher() to authenticated;

-- Legacy deployments may contain additional application columns that are no
-- longer part of the canonical write model but are still marked NOT NULL.
-- Relax only those superseded columns; canonical required fields remain
-- protected by their existing NOT NULL and content constraints.
do $$
declare
  legacy_column record;
begin
  for legacy_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'club_applications'
      and is_nullable = 'NO'
      and column_name not in (
        'id', 'club_name', 'category', 'description', 'status', 'created_at'
      )
  loop
    execute format(
      'alter table public.club_applications alter column %I drop not null',
      legacy_column.column_name
    );
  end loop;
end;
$$;

-- Some production databases still retain required legacy columns from the
-- original dashboard schema. Populate those columns from the canonical fields
-- before constraints run. jsonb_populate_record safely ignores keys that do
-- not exist on newer installations.
create or replace function public.sync_club_application_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new := jsonb_populate_record(
    new,
    jsonb_build_object(
      'club_category', new.category,
      'club_description', new.description,
      'meeting_dates', coalesce(new.meeting_days, ''),
      'club_appsStatus', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists sync_club_application_legacy_columns on public.club_applications;
create trigger sync_club_application_legacy_columns
  before insert or update of category, description, meeting_days, status
  on public.club_applications
  for each row execute function public.sync_club_application_legacy_columns();

revoke all on function public.sync_club_application_legacy_columns() from public, anon, authenticated;

drop policy if exists "Members can submit applications" on public.club_applications;
drop policy if exists "Members submit applications" on public.club_applications;
drop policy if exists "Teachers submit Club applications" on public.club_applications;
create policy "Teachers submit Club applications"
  on public.club_applications for insert
  with check (
    auth.uid() = submitted_by
    and public.is_teacher()
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "Admins review applications" on public.club_applications;
drop policy if exists "Staff review applications" on public.club_applications;
drop policy if exists "Admins review Club applications" on public.club_applications;
create policy "Admins review Club applications"
  on public.club_applications for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.club_applications to authenticated;

create or replace function public.promote_approved_club_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_slug text;
  promoted_club_id uuid;
  teacher_name text;
  teacher_email text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.submitted_by is null or not exists (
      select 1 from public.profiles p
      where p.id = new.submitted_by and p.role = 'teacher'
    ) then
      raise exception 'Approved Club applications require a teacher applicant' using errcode = '23514';
    end if;

    base_slug := trim(both '-' from regexp_replace(lower(new.club_name), '[^a-z0-9]+', '-', 'g'));
    insert into public.clubs (
      slug, name, short_description, interest_tags, is_stem,
      is_community_service, contact_email, created_by, status
    ) values (
      case when exists (select 1 from public.clubs where slug = base_slug)
        then base_slug || '-' || left(new.id::text, 8)
        else base_slug
      end, new.club_name, new.description,
      array[new.category], new.category = 'STEM', new.category = 'Community Service',
      new.contact_email, new.submitted_by, 'published'
    )
    on conflict (slug) do update set
      name = excluded.name,
      short_description = excluded.short_description,
      interest_tags = excluded.interest_tags,
      is_stem = excluded.is_stem,
      is_community_service = excluded.is_community_service,
      contact_email = excluded.contact_email,
      status = 'published',
      updated_at = now()
    returning id into promoted_club_id;

    select p.full_name, p.email into teacher_name, teacher_email
    from public.profiles p where p.id = new.submitted_by;

    insert into public.club_advisors (club_id, profile_id, display_name, contact_email)
    values (promoted_club_id, new.submitted_by, teacher_name, teacher_email)
    on conflict (club_id, profile_id) do update set
      display_name = excluded.display_name,
      contact_email = excluded.contact_email;
  end if;
  return new;
end;
$$;

drop trigger if exists approved_application_creates_club on public.club_applications;
create trigger approved_application_creates_club
  after insert or update of status on public.club_applications
  for each row execute function public.promote_approved_club_application();

revoke all on function public.promote_approved_club_application() from public, anon, authenticated;

-- ============================================================================
-- 44. admin_club_authority.sql
-- ============================================================================

-- Keep site authority separate from Club identity.
-- Admins can manage every Club through can_manage_club; they are not Advisors.

create or replace function public.validate_club_advisor_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare account_role text;
begin
  select role into account_role from public.profiles where id=new.profile_id;
  if account_role not in ('teacher','advisor') then
    raise exception 'Only Teacher or Advisor accounts may be listed as Club advisors' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_club_advisor_identity() from public,anon,authenticated;
grant execute on function public.valid_club_tags(text[])
to authenticated;

-- Remove legacy rows that confused global Admin authority with Club Advisor identity.
delete from public.club_advisors a using public.profiles p
where p.id=a.profile_id and p.role in ('admin','staff');

drop trigger if exists validate_club_advisor_identity on public.club_advisors;
create trigger validate_club_advisor_identity before insert or update of profile_id
on public.club_advisors for each row execute function public.validate_club_advisor_identity();

-- Explicitly preserve global Admin/Staff access without creating identity rows.
create or replace function public.can_govern_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_staff_or_admin()
    or public.has_custom_permission('clubs.govern',p_club_id)
    or exists(select 1 from public.club_advisors where club_id=p_club_id and profile_id=auth.uid());
$$;
create or replace function public.can_manage_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.can_govern_club(p_club_id)
    or public.has_custom_permission('clubs.manage',p_club_id)
    or exists(select 1 from public.club_officers where club_id=p_club_id and profile_id=auth.uid() and (term_start is null or term_start<=current_date) and (term_end is null or term_end>=current_date));
$$;

-- ============================================================================
-- 45. club_officer_avatars.sql
-- ============================================================================

-- Self-managed board portraits for the public "Meet the board" section.
-- Run after club_governance.sql.
begin;

alter table public.club_officers add column if not exists avatar_path text;
alter table public.club_officers drop constraint if exists club_officers_avatar_path_check;
alter table public.club_officers add constraint club_officers_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) between 10 and 500 and avatar_path !~ '(^|/)\.\.(/|$)'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('board-avatars','board-avatars',true,4194304,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_write_board_avatar(p_name text)
returns boolean language plpgsql security definer set search_path=public,storage stable as $$
declare parts text[]; target_club uuid; target_profile uuid;
begin
  if auth.uid() is null then return false; end if;
  parts:=storage.foldername(p_name);
  if cardinality(parts)<2 then return false; end if;
  target_club:=parts[1]::uuid; target_profile:=parts[2]::uuid;
  if public.can_govern_club(target_club) then return true; end if;
  return target_profile=auth.uid() and exists(
    select 1 from public.club_officers o where o.club_id=target_club and o.profile_id=auth.uid()
      and (o.term_start is null or o.term_start<=current_date)
      and (o.term_end is null or o.term_end>=current_date)
  );
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.can_write_board_avatar(text) from public;
grant execute on function public.can_write_board_avatar(text) to authenticated;

drop policy if exists "Public reads board avatars" on storage.objects;
create policy "Public reads board avatars" on storage.objects for select
  using(bucket_id='board-avatars');
drop policy if exists "Board members upload own avatars" on storage.objects;
create policy "Board members upload own avatars" on storage.objects for insert to authenticated
  with check(bucket_id='board-avatars' and public.can_write_board_avatar(name));
drop policy if exists "Board members replace own avatars" on storage.objects;
create policy "Board members replace own avatars" on storage.objects for update to authenticated
  using(bucket_id='board-avatars' and public.can_write_board_avatar(name))
  with check(bucket_id='board-avatars' and public.can_write_board_avatar(name));
drop policy if exists "Board members delete own avatars" on storage.objects;
create policy "Board members delete own avatars" on storage.objects for delete to authenticated
  using(bucket_id='board-avatars' and public.can_write_board_avatar(name));

create or replace function public.set_club_officer_avatar(p_officer_id uuid,p_avatar_path text)
returns text language plpgsql security definer set search_path=public as $$
declare officer public.club_officers; previous_path text;
begin
  select * into officer from public.club_officers where id=p_officer_id for update;
  if not found then raise exception 'Board member not found' using errcode='P0002'; end if;
  if not public.can_govern_club(officer.club_id) and not (
    officer.profile_id=auth.uid()
    and (officer.term_start is null or officer.term_start<=current_date)
    and (officer.term_end is null or officer.term_end>=current_date)
  ) then raise exception 'You may update only your own board portrait' using errcode='42501'; end if;
  if p_avatar_path is not null and (
    p_avatar_path not like officer.club_id::text||'/'||officer.profile_id::text||'/%'
    or char_length(p_avatar_path)>500 or p_avatar_path~'(^|/)\.\.(/|$)'
  ) then raise exception 'Invalid board portrait path' using errcode='23514'; end if;
  previous_path:=officer.avatar_path;
  update public.club_officers set avatar_path=p_avatar_path where id=p_officer_id;
  return previous_path;
end $$;
revoke all on function public.set_club_officer_avatar(uuid,text) from public;
grant execute on function public.set_club_officer_avatar(uuid,text) to authenticated;

commit;

-- ============================================================================
-- 46. school_operations.sql
-- ============================================================================

-- Trips, governance documents, facilities, event approvals, and product analytics.
-- Apply after club_governance.sql and club_finance.sql.
begin;
alter table public.clubs add column if not exists category text;
alter table public.clubs add column if not exists school_year text;

create table if not exists public.club_trips(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,title text not null,trip_date date not null,destination text not null,plan text not null,consent_required boolean not null default true,status text not null default 'draft' check(status in('draft','submitted','approved','rejected','completed')),submitted_by uuid not null references public.profiles(id),reviewed_by uuid references public.profiles(id),review_note text,created_at timestamptz not null default now());
create table if not exists public.trip_consents(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.club_trips(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,status text not null default 'pending' check(status in('pending','received','declined','not_required')),updated_by uuid references public.profiles(id),updated_at timestamptz not null default now(),unique(trip_id,profile_id));
create table if not exists public.club_constitution_versions(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,version_number integer not null check(version_number>0),body text not null,change_summary text not null,adopted_on date,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(club_id,version_number));
create table if not exists public.club_elections(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,title text not null,election_date date not null,positions text[] not null default '{}',status text not null default 'planned' check(status in('planned','open','completed','cancelled')),result_summary text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table if not exists public.club_budgets(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,school_year text not null,allocated_cents integer not null check(allocated_cents>=0),notes text,updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),unique(club_id,school_year));
create table if not exists public.club_reimbursements(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,school_year text not null,amount_cents integer not null check(amount_cents>0),purpose text not null,receipt_reference text not null,status text not null default 'pending' check(status in('pending','approved','rejected','paid')),submitted_by uuid not null references public.profiles(id),reviewed_by uuid references public.profiles(id),review_note text,created_at timestamptz not null default now());
create table if not exists public.facility_permits(id uuid primary key default gen_random_uuid(),club_id uuid references public.clubs(id) on delete cascade,event_id text,title text not null,event_date date not null,start_time time,end_time time,room text,needs_security boolean not null default false,needs_library boolean not null default false,needs_av boolean not null default false,room_status text not null default 'pending',security_status text not null default 'not_required',library_status text not null default 'not_required',av_status text not null default 'not_required',overall_status text not null default 'pending' check(overall_status in('pending','approved','rejected')),submitted_by uuid not null references public.profiles(id),review_note text,created_at timestamptz not null default now());
create table if not exists public.event_approval_requests(id uuid primary key default gen_random_uuid(),club_id uuid references public.clubs(id) on delete cascade,title text not null,description text not null,start_at timestamptz not null,end_at timestamptz,location text,capacity integer check(capacity is null or capacity>0),status text not null default 'pending' check(status in('pending','approved','rejected')),submitted_by uuid not null references public.profiles(id),reviewed_by uuid references public.profiles(id),review_note text,created_at timestamptz not null default now());
create table if not exists public.event_registrations(id uuid primary key default gen_random_uuid(),approval_id uuid not null references public.event_approval_requests(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,status text not null default 'pending' check(status in('pending','approved','waitlisted','rejected','cancelled')),reviewed_by uuid references public.profiles(id),review_note text,created_at timestamptz not null default now(),unique(approval_id,profile_id));
create table if not exists public.analytics_events(id bigint generated always as identity primary key,event_name text not null,route text,entity_id text,metric_value double precision,metadata jsonb not null default '{}',user_id uuid references public.profiles(id) on delete set null,session_id text,created_at timestamptz not null default now());
create index if not exists analytics_events_name_created_idx on public.analytics_events(event_name,created_at desc);

do $$ declare t text; begin foreach t in array array['club_trips','trip_consents','club_constitution_versions','club_elections','club_budgets','club_reimbursements','facility_permits','event_approval_requests','event_registrations','analytics_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
drop policy if exists "Board reads trips" on public.club_trips; drop policy if exists "Board submits trips" on public.club_trips; drop policy if exists "Governors review trips" on public.club_trips;
drop policy if exists "Board manages trip consent" on public.trip_consents; drop policy if exists "Members read own trip consent" on public.trip_consents;
drop policy if exists "Board reads constitutions" on public.club_constitution_versions; drop policy if exists "Board adds constitution versions" on public.club_constitution_versions;
drop policy if exists "Board manages elections" on public.club_elections; drop policy if exists "Board reads budgets" on public.club_budgets; drop policy if exists "Governors manage budgets" on public.club_budgets;
drop policy if exists "Board manages reimbursements" on public.club_reimbursements; drop policy if exists "Board submits reimbursements" on public.club_reimbursements; drop policy if exists "Governors review reimbursements" on public.club_reimbursements;
drop policy if exists "Board manages permits" on public.facility_permits; drop policy if exists "Board submits permits" on public.facility_permits; drop policy if exists "Staff reviews permits" on public.facility_permits;
drop policy if exists "Board submits events" on public.event_approval_requests; drop policy if exists "Board and staff read events" on public.event_approval_requests; drop policy if exists "Public reads approved events" on public.event_approval_requests; drop policy if exists "Staff reviews events" on public.event_approval_requests;
drop policy if exists "Users read own registration" on public.event_registrations; drop policy if exists "Users register" on public.event_registrations; drop policy if exists "Staff reviews registrations" on public.event_registrations; drop policy if exists "Admins read analytics" on public.analytics_events;
create policy "Board reads trips" on public.club_trips for select using(public.can_manage_club(club_id));
create policy "Board submits trips" on public.club_trips for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid() and status='submitted');
create policy "Governors review trips" on public.club_trips for update using(public.can_govern_club(club_id));
create policy "Board manages trip consent" on public.trip_consents for all using(exists(select 1 from public.club_trips t where t.id=trip_id and public.can_manage_club(t.club_id))) with check(exists(select 1 from public.club_trips t where t.id=trip_id and public.can_manage_club(t.club_id)));
create policy "Members read own trip consent" on public.trip_consents for select using(profile_id=auth.uid());
create policy "Board reads constitutions" on public.club_constitution_versions for select using(public.can_manage_club(club_id));
create policy "Board adds constitution versions" on public.club_constitution_versions for insert with check(public.can_manage_club(club_id) and created_by=auth.uid());
create policy "Board manages elections" on public.club_elections for all using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
create policy "Board reads budgets" on public.club_budgets for select using(public.can_manage_club(club_id));
create policy "Governors manage budgets" on public.club_budgets for all using(public.can_govern_club(club_id)) with check(public.can_govern_club(club_id));
create policy "Board manages reimbursements" on public.club_reimbursements for select using(public.can_manage_club(club_id));
create policy "Board submits reimbursements" on public.club_reimbursements for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid());
create policy "Governors review reimbursements" on public.club_reimbursements for update using(public.can_govern_club(club_id));
create policy "Board manages permits" on public.facility_permits for select using(public.can_manage_club(club_id) or public.is_staff_or_admin());
create policy "Board submits permits" on public.facility_permits for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid());
create policy "Staff reviews permits" on public.facility_permits for update using(public.is_staff_or_admin());
create policy "Board submits events" on public.event_approval_requests for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid());
create policy "Board and staff read events" on public.event_approval_requests for select using(public.can_manage_club(club_id) or public.is_staff_or_admin());
create policy "Public reads approved events" on public.event_approval_requests for select using(status='approved');
create policy "Staff reviews events" on public.event_approval_requests for update using(public.is_staff_or_admin());
create policy "Users read own registration" on public.event_registrations for select using(profile_id=auth.uid() or public.is_staff_or_admin());
create policy "Users register" on public.event_registrations for insert with check(profile_id=auth.uid());
create policy "Staff reviews registrations" on public.event_registrations for update using(public.is_staff_or_admin());
create policy "Admins read analytics" on public.analytics_events for select using(public.is_admin());

create or replace function public.record_analytics_event(p_event_name text,p_route text default null,p_entity_id text default null,p_metric_value double precision default null,p_metadata jsonb default '{}',p_session_id text default null) returns void language plpgsql security definer set search_path=public as $$ begin if p_event_name not in('page_view','search_result_click','club_join_started','club_join_completed','LCP','INP','CLS') then return; end if; insert into public.analytics_events(event_name,route,entity_id,metric_value,metadata,user_id,session_id) values(p_event_name,left(p_route,300),left(p_entity_id,120),p_metric_value,coalesce(p_metadata,'{}'),auth.uid(),left(p_session_id,80)); end $$;
revoke all on function public.record_analytics_event(text,text,text,double precision,jsonb,text) from public;
grant execute on function public.record_analytics_event(text,text,text,double precision,jsonb,text) to anon,authenticated;
do $$ declare t text; begin
  if to_regprocedure('public.log_club_change()') is not null then foreach t in array array['club_trips','club_constitution_versions','club_elections','club_budgets','club_reimbursements','facility_permits','event_approval_requests'] loop execute format('drop trigger if exists audit_club_change on public.%I',t); execute format('create trigger audit_club_change after insert or update or delete on public.%I for each row execute function public.log_club_change()',t); end loop; end if;
  if to_regprocedure('public.audit_management_change()') is not null then foreach t in array array['club_trips','trip_consents','club_constitution_versions','club_elections','club_budgets','club_reimbursements','facility_permits','event_approval_requests','event_registrations'] loop execute format('drop trigger if exists %I on public.%I',t||'_global_audit',t); execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_management_change()',t||'_global_audit',t); end loop; end if;
end $$;
commit;

-- ============================================================================
-- 47. public_club_constitutions.sql
-- ============================================================================

-- Publish the latest constitution with each published Club and backfill
-- Advisor display names from their linked profile records.
begin;

update public.club_advisors advisor
set display_name = profile.full_name,
    contact_email = coalesce(advisor.contact_email, profile.email)
from public.profiles profile
where advisor.profile_id = profile.id
  and nullif(btrim(coalesce(advisor.display_name, '')), '') is null
  and nullif(btrim(coalesce(profile.full_name, '')), '') is not null;

drop policy if exists "Public reads published Club constitutions" on public.club_constitution_versions;
create policy "Public reads published Club constitutions"
on public.club_constitution_versions
for select
using (
  exists (
    select 1 from public.clubs club
    where club.id = club_id and club.status = 'published'
  )
);

commit;

-- ============================================================================
-- 48. workflow_completion.sql
-- ============================================================================

-- Production workflow completion: consent signatures, elections, private receipts,
-- staged permits, capacity-safe registration, import rollback, and notifications.
-- Run after school_operations.sql and operational_intelligence.sql.

alter table public.trip_consents add column if not exists guardian_name text;
alter table public.trip_consents add column if not exists guardian_email text;
alter table public.trip_consents add column if not exists guardian_signature text;
alter table public.trip_consents add column if not exists signed_at timestamptz;
alter table public.trip_consents add column if not exists document_path text;
alter table public.trip_consents add column if not exists due_at timestamptz;
alter table public.trip_consents add column if not exists reminder_sent_at timestamptz;
alter table public.club_reimbursements add column if not exists receipt_path text;
alter table public.club_elections add column if not exists opens_at timestamptz;
alter table public.club_elections add column if not exists closes_at timestamptz;
alter table public.club_elections add column if not exists results_locked_at timestamptz;

create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(), election_id uuid not null references public.club_elections(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, position text not null,
  statement text, status text not null default 'approved' check(status in('pending','approved','withdrawn','disqualified')),
  created_at timestamptz not null default now(), unique(election_id,profile_id,position)
);
create table if not exists public.election_ballots (
  id uuid primary key default gen_random_uuid(), election_id uuid not null references public.club_elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade, position text not null,
  candidate_id uuid not null references public.election_candidates(id) on delete restrict,
  created_at timestamptz not null default now(), unique(election_id,voter_id,position)
);
create table if not exists public.permit_approvals (
  id uuid primary key default gen_random_uuid(), permit_id uuid not null references public.facility_permits(id) on delete cascade,
  department text not null check(department in('room','security','library','av')), step_order integer not null check(step_order between 1 and 4),
  assigned_to uuid references public.profiles(id), status text not null default 'pending' check(status in('pending','approved','rejected','skipped')),
  note text, decided_by uuid references public.profiles(id), decided_at timestamptz, created_at timestamptz not null default now(),
  unique(permit_id,department), unique(permit_id,step_order)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, title text not null, body text not null, href text, read_at timestamptz,
  dedupe_key text, created_at timestamptz not null default now(), unique(user_id,dedupe_key)
);
create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key, notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check(channel in('email')), status text not null default 'pending' check(status in('pending','sent','failed','skipped')),
  attempts integer not null default 0, available_at timestamptz not null default now(), last_error text, sent_at timestamptz
);
create table if not exists public.club_import_batches (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id), file_name text not null,
  status text not null default 'preview' check(status in('preview','applied','rolled_back','failed')),
  total_rows integer not null default 0, valid_rows integer not null default 0, error_rows integer not null default 0,
  created_at timestamptz not null default now(), applied_at timestamptz, rolled_back_at timestamptz
);
create table if not exists public.club_import_rows (
  id bigint generated always as identity primary key, batch_id uuid not null references public.club_import_batches(id) on delete cascade,
  row_number integer not null, payload jsonb not null, errors text[] not null default '{}', before_state jsonb,
  club_id uuid references public.clubs(id) on delete set null, action text check(action in('insert','update')), unique(batch_id,row_number)
);

do $$ declare t text; begin foreach t in array array['election_candidates','election_ballots','permit_approvals','notifications','notification_outbox','club_import_batches','club_import_rows'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
drop policy if exists "Boards manage candidates" on public.election_candidates;
drop policy if exists "Members view candidates" on public.election_candidates;
drop policy if exists "Members cast ballots" on public.election_ballots;
drop policy if exists "Voters view own ballot" on public.election_ballots;
drop policy if exists "Permit participants read stages" on public.permit_approvals;
drop policy if exists "Assigned approvers decide stage" on public.permit_approvals;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users mark own notifications" on public.notifications;
drop policy if exists "Admins manage notification delivery" on public.notification_outbox;
drop policy if exists "Admins manage import batches" on public.club_import_batches;
drop policy if exists "Admins manage import rows" on public.club_import_rows;
drop policy if exists "Members submit own trip consent" on public.trip_consents;
create policy "Boards manage candidates" on public.election_candidates for all using(exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id))) with check(exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id)));
create policy "Members view candidates" on public.election_candidates for select using(exists(select 1 from public.club_elections e join public.club_memberships m on m.club_id=e.club_id where e.id=election_id and m.profile_id=auth.uid() and m.status='active'));
create policy "Members cast ballots" on public.election_ballots for insert with check(voter_id=auth.uid() and exists(select 1 from public.club_elections e join public.club_memberships m on m.club_id=e.club_id where e.id=election_id and e.status='open' and e.results_locked_at is null and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>now()) and m.profile_id=auth.uid() and m.status='active'));
create policy "Voters view own ballot" on public.election_ballots for select using(voter_id=auth.uid() or exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id) and e.results_locked_at is not null));
create policy "Permit participants read stages" on public.permit_approvals for select using(exists(select 1 from public.facility_permits p where p.id=permit_id and (public.can_manage_club(p.club_id) or public.is_staff_or_admin())));
create policy "Assigned approvers decide stage" on public.permit_approvals for update using(public.is_admin() or assigned_to=auth.uid());
create policy "Users read own notifications" on public.notifications for select using(user_id=auth.uid());
create policy "Users mark own notifications" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Admins manage notification delivery" on public.notification_outbox for all using(public.is_admin()) with check(public.is_admin());
create policy "Admins manage import batches" on public.club_import_batches for all using(public.is_admin()) with check(public.is_admin() and created_by=auth.uid());
create policy "Admins manage import rows" on public.club_import_rows for all using(public.is_admin()) with check(public.is_admin());
create policy "Members submit own trip consent" on public.trip_consents for update using(profile_id=auth.uid()) with check(profile_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('trip-consents','trip-consents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
 ('club-receipts','club-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Consent owners upload documents" on storage.objects;
drop policy if exists "Consent owners read documents" on storage.objects;
create policy "Consent owners upload documents" on storage.objects for insert to authenticated with check(bucket_id='trip-consents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Consent owners read documents" on storage.objects for select to authenticated using(bucket_id='trip-consents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_staff_or_admin()));
drop policy if exists "Club managers upload receipts" on storage.objects;
drop policy if exists "Club governors read receipts" on storage.objects;
create policy "Club managers upload receipts" on storage.objects for insert to authenticated with check(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Club governors read receipts" on storage.objects for select to authenticated using(bucket_id='club-receipts' and public.can_govern_club(((storage.foldername(name))[1])::uuid));

create or replace function public.register_for_event(p_approval_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare cap integer; approved_count integer; next_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select capacity into cap from public.event_approval_requests where id=p_approval_id and status='approved' for update;
  if not found then raise exception 'Event is not open'; end if;
  select count(*) into approved_count from public.event_registrations where approval_id=p_approval_id and status='approved';
  next_status:=case when cap is null or approved_count<cap then 'approved' else 'waitlisted' end;
  insert into public.event_registrations(approval_id,profile_id,status) values(p_approval_id,auth.uid(),next_status)
  on conflict(approval_id,profile_id) do update set status=excluded.status,reviewed_by=null,review_note=null;
  return next_status;
end $$;
grant execute on function public.register_for_event(uuid) to authenticated;

create or replace function public.cancel_event_registration(p_registration_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare aid uuid; promoted uuid;
begin
  update public.event_registrations set status='cancelled' where id=p_registration_id and (profile_id=auth.uid() or public.is_staff_or_admin()) returning approval_id into aid;
  if aid is null then raise exception 'Registration not found'; end if;
  select id into promoted from public.event_registrations where approval_id=aid and status='waitlisted' order by created_at for update skip locked limit 1;
  if promoted is not null then update public.event_registrations set status='approved',review_note='Automatically promoted from waitlist' where id=promoted; end if;
  return case when promoted is null then 'cancelled' else 'promoted' end;
end $$;
grant execute on function public.cancel_event_registration(uuid) to authenticated;

create or replace function public.cast_election_vote(p_election_id uuid,p_position text,p_candidate_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.election_candidates c join public.club_elections e on e.id=c.election_id join public.club_memberships m on m.club_id=e.club_id where c.id=p_candidate_id and c.election_id=p_election_id and c.position=p_position and c.status='approved' and e.status='open' and e.results_locked_at is null and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>now()) and m.profile_id=auth.uid() and m.status='active') then raise exception 'Voting is not open'; end if;
 insert into public.election_ballots(election_id,voter_id,position,candidate_id) values(p_election_id,auth.uid(),p_position,p_candidate_id) on conflict(election_id,voter_id,position) do update set candidate_id=excluded.candidate_id,created_at=now();
end $$;
grant execute on function public.cast_election_vote(uuid,text,uuid) to authenticated;

create or replace function public.lock_election_results(p_election_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; cid uuid; begin
 select club_id into cid from public.club_elections where id=p_election_id for update;
 if cid is null or not public.can_manage_club(cid) then raise exception 'Club board access required'; end if;
 select coalesce(jsonb_agg(x order by x.position,x.votes desc),'[]'::jsonb) into result from (select c.position,c.id candidate_id,p.full_name candidate_name,count(b.id) votes from public.election_candidates c join public.profiles p on p.id=c.profile_id left join public.election_ballots b on b.candidate_id=c.id where c.election_id=p_election_id and c.status='approved' group by c.position,c.id,p.full_name) x;
 update public.club_elections set status='completed',results_locked_at=now(),result_summary=result::text where id=p_election_id;
 return result;
end $$;
grant execute on function public.lock_election_results(uuid) to authenticated;

create or replace function public.recompute_permit_status() returns trigger language plpgsql security definer set search_path=public as $$
declare waiting integer; denied integer; begin
 select count(*) filter(where status='pending'),count(*) filter(where status='rejected') into waiting,denied from public.permit_approvals where permit_id=new.permit_id;
 update public.facility_permits set overall_status=case when denied>0 then 'rejected' when waiting=0 then 'approved' else 'pending' end,
 room_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='room'),'not_required'),
 security_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='security'),'not_required'),
 library_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='library'),'not_required'),
 av_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='av'),'not_required') where id=new.permit_id;
 return new; end $$;
drop trigger if exists permit_stage_status on public.permit_approvals;
create trigger permit_stage_status after insert or update of status on public.permit_approvals for each row execute function public.recompute_permit_status();

create or replace function public.queue_notification(p_user_id uuid,p_kind text,p_title text,p_body text,p_href text default null,p_dedupe_key text default null,p_email boolean default true) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; begin
 insert into public.notifications(user_id,kind,title,body,href,dedupe_key) values(p_user_id,left(p_kind,60),left(p_title,160),left(p_body,2000),left(p_href,500),p_dedupe_key)
 on conflict(user_id,dedupe_key) do update set title=excluded.title,body=excluded.body,href=excluded.href returning id into nid;
 if p_email and not exists(select 1 from public.notification_outbox where notification_id=nid and channel='email') then insert into public.notification_outbox(notification_id,channel) values(nid,'email'); end if;
 return nid; end $$;
revoke all on function public.queue_notification(uuid,text,text,text,text,text,boolean) from public;
grant execute on function public.queue_notification(uuid,text,text,text,text,text,boolean) to service_role;

-- Reminder worker: invoke daily from Supabase Cron/Edge Function, then consume notification_outbox.
create or replace function public.queue_due_workflow_reminders() returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; begin
 for r in select tc.id,tc.profile_id,tc.due_at,t.title from public.trip_consents tc join public.club_trips t on t.id=tc.trip_id where tc.status='pending' and tc.due_at between now() and now()+interval '3 days' and tc.reminder_sent_at is null loop
   perform public.queue_notification(r.profile_id,'consent_due','Trip consent due',r.title||' consent is due soon.','/profile#trip-consent','consent:'||r.id,true);
   update public.trip_consents set reminder_sent_at=now() where id=r.id; n:=n+1;
 end loop; return n; end $$;
revoke all on function public.queue_due_workflow_reminders() from public;
grant execute on function public.queue_due_workflow_reminders() to service_role;

-- ============================================================================
-- 49. club_csv_advisor_import.sql
-- ============================================================================

-- CSV Club roster imports and deferred Advisor access claiming.
-- Apply after workflow_completion.sql and admin_club_authority.sql.
begin;

create table if not exists public.pending_club_advisors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  display_name text not null check(char_length(btrim(display_name)) between 2 and 120),
  created_by uuid not null references public.profiles(id),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(club_id,email)
);

create table if not exists public.club_import_related_records (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.club_import_batches(id) on delete cascade,
  import_row_id bigint not null references public.club_import_rows(id) on delete cascade,
  entity_type text not null check(entity_type in ('meeting','advisor','pending_advisor')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(batch_id,entity_type,entity_id)
);

alter table public.pending_club_advisors enable row level security;
alter table public.club_import_related_records enable row level security;
drop policy if exists "Admins manage pending Club advisors" on public.pending_club_advisors;
drop policy if exists "Admins manage import related records" on public.club_import_related_records;
create policy "Admins manage pending Club advisors" on public.pending_club_advisors for all using(public.is_admin()) with check(public.is_admin());
create policy "Admins manage import related records" on public.club_import_related_records for all using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.pending_club_advisors to authenticated;
grant select,insert,delete on public.club_import_related_records to authenticated;
grant usage,select on sequence public.club_import_related_records_id_seq to authenticated;

create or replace function public.claim_pending_club_advisories()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role not in ('teacher','advisor') or nullif(lower(btrim(new.email)),'') is null then return new; end if;
  insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
  select pending.club_id,new.id,pending.display_name,lower(btrim(new.email))
  from public.pending_club_advisors pending
  where pending.email=lower(btrim(new.email)) and pending.claimed_at is null
  on conflict(club_id,profile_id) do update set display_name=excluded.display_name,contact_email=excluded.contact_email;
  update public.pending_club_advisors set claimed_profile_id=new.id,claimed_at=now()
  where email=lower(btrim(new.email)) and claimed_at is null;
  return new;
end $$;
revoke all on function public.claim_pending_club_advisories() from public,anon,authenticated;

drop trigger if exists claim_pending_club_advisories on public.profiles;
create trigger claim_pending_club_advisories after insert or update of email,role on public.profiles
for each row execute function public.claim_pending_club_advisories();

commit;

-- ============================================================================
-- 50. home_dashboard.sql
-- ============================================================================

-- Fast, permission-aware data for the signed-in home dashboard.
-- Run after custom_permissions.sql and the support/Club migrations.
begin;

create or replace function public.get_home_dashboard()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'active_clubs', coalesce((
      select jsonb_agg(
        jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name)
        order by c.name
      )
      from public.club_memberships m
      join public.clubs c on c.id=m.club_id
      where m.profile_id=auth.uid() and m.status='active'
    ), '[]'::jsonb),
    'pending_memberships', (
      select count(*) from public.club_memberships
      where profile_id=auth.uid() and status='pending'
    ),
    'pending_applications', (
      select count(*) from public.club_applications
      where submitted_by=auth.uid() and status='pending'
    ),
    'open_support_requests', (
      select count(*) from public.support_requests
      where submitted_by=auth.uid() and status in ('open','in_review')
    ),
    'managed_club_count', (
      select count(*) from public.clubs c
      where public.can_manage_club(c.id)
    )
  ) end;
$$;

revoke all on function public.get_home_dashboard() from public,anon;
grant execute on function public.get_home_dashboard() to authenticated;

commit;

-- ============================================================================
-- 51. realtime_notifications_dashboard.sql
-- ============================================================================

-- Realtime/PWA notifications and personalized dashboard details.
-- Run after member_actions.sql, school_operations.sql, workflow_completion.sql,
-- announcement_audience_notifications.sql, custom_permissions.sql,
-- club_attendance.sql, calendar_meeting_emergency.sql, and home_dashboard.sql.
begin;

alter table public.notifications add column if not exists deleted_at timestamptz;
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc) where deleted_at is null;
create index if not exists notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null and deleted_at is null;

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications for delete using(user_id=auth.uid());

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check(char_length(endpoint) between 20 and 2000),
  p256dh text not null check(char_length(p256dh) between 20 and 500),
  auth text not null check(char_length(auth) between 8 and 200),
  expires_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all
using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.push_subscriptions to authenticated;

create table if not exists public.push_notification_deliveries(
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  unique(notification_id,subscription_id)
);
create index if not exists push_delivery_queue_idx on public.push_notification_deliveries(status,available_at);
alter table public.push_notification_deliveries enable row level security;

create or replace function public.enqueue_push_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.push_notification_deliveries(notification_id,subscription_id)
  select new.id,s.id from public.push_subscriptions s
  where s.user_id=new.user_id and (s.expires_at is null or s.expires_at>now())
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_push_notification() from public,anon,authenticated;
drop trigger if exists notification_push_enqueue on public.notifications;
create trigger notification_push_enqueue after insert on public.notifications
for each row execute function public.enqueue_push_notification();

create or replace function public.claim_push_deliveries(p_limit integer default 50)
returns table(
  delivery_id bigint, notification_id uuid, subscription_id uuid,
  endpoint text, p256dh text, auth text, title text, body text, href text, kind text
) language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return query
  with claimed as (
    select d.id from public.push_notification_deliveries d
    where (
      d.status in ('pending','failed') and d.available_at<=now()
      or d.status='processing' and d.claimed_at<now()-interval '10 minutes'
    ) and d.attempts<5
    order by d.available_at,d.id for update skip locked limit greatest(1,least(p_limit,100))
  ), updated as (
    update public.push_notification_deliveries d set status='processing',claimed_at=now(),attempts=d.attempts+1
    from claimed where d.id=claimed.id returning d.*
  )
  select u.id,u.notification_id,u.subscription_id,s.endpoint,s.p256dh,s.auth,n.title,n.body,n.href,n.kind
  from updated u join public.push_subscriptions s on s.id=u.subscription_id
  join public.notifications n on n.id=u.notification_id;
end $$;
revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create table if not exists public.dashboard_preferences(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  card_order text[] not null default array['meeting','attendance','registrations','deadlines','notifications'],
  hidden_cards text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check(card_order <@ array['meeting','attendance','registrations','deadlines','notifications']::text[]),
  check(hidden_cards <@ array['meeting','attendance','registrations','deadlines','notifications']::text[])
);
alter table public.dashboard_preferences
  alter column card_order set default array['meeting','attendance','registrations','deadlines','notifications'];
update public.dashboard_preferences
set card_order=array_remove(card_order,'period'),
    hidden_cards=array_remove(hidden_cards,'period')
where 'period'=any(card_order) or 'period'=any(hidden_cards);
alter table public.dashboard_preferences enable row level security;
drop policy if exists "Users manage own dashboard preferences" on public.dashboard_preferences;
create policy "Users manage own dashboard preferences" on public.dashboard_preferences for all
using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.dashboard_preferences to authenticated;

create or replace function public.get_home_dashboard()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'active_clubs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name) order by c.name)
      from public.club_memberships m join public.clubs c on c.id=m.club_id where m.profile_id=auth.uid() and m.status='active'),'[]'::jsonb),
    'pending_memberships',(select count(*) from public.club_memberships where profile_id=auth.uid() and status='pending'),
    'pending_applications',(select count(*) from public.club_applications where submitted_by=auth.uid() and status='pending'),
    'open_support_requests',(select count(*) from public.support_requests where submitted_by=auth.uid() and status in('open','in_review')),
    'managed_club_count',(select count(*) from public.clubs c where public.can_manage_club(c.id)),
    'unread_notifications',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null and deleted_at is null),
    'recent_attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.checked_in_at desc) from (
      select r.id,s.label as session_label,c.name as club_name,c.slug as club_slug,r.checked_in_at
      from public.club_attendance_records r join public.club_attendance_sessions s on s.id=r.session_id join public.clubs c on c.id=r.club_id
      where r.profile_id=auth.uid() order by r.checked_in_at desc limit 3
    ) a),'[]'::jsonb),
    'registered_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.start_at) from (
      select ev.id::text,ev.title,ev.start_at,ev.location,'rsvp'::text as source
      from public.event_rsvps r join public.events ev on ev.id::text=r.event_id
      where r.user_id=auth.uid() and ev.published and ev.start_at>=now()
      union all
      select a.id::text,a.title,a.start_at,a.location,'registration'::text
      from public.event_registrations r join public.event_approval_requests a on a.id=r.approval_id
      where r.profile_id=auth.uid() and r.status in('approved','waitlisted') and a.start_at>=now()
      order by start_at limit 3
    ) e),'[]'::jsonb),
    'upcoming_deadlines',coalesce((select jsonb_agg(to_jsonb(o) order by o.deadline) from (
      select id,title,category,deadline from public.opportunities
      where status='published' and deadline between current_date and current_date+interval '45 days'
      order by deadline limit 3
    ) o),'[]'::jsonb),
    'next_meeting',(select to_jsonb(nm) from (
      select c.id as club_id,c.slug as club_slug,c.name as club_name,m.location,
        ((d.meeting_date+m.start_time) at time zone 'America/New_York') as starts_at
      from public.club_memberships cm join public.clubs c on c.id=cm.club_id
      join public.club_meetings m on m.club_id=c.id
      cross join lateral (
        select day::date as meeting_date from generate_series(current_date,current_date+14,interval '1 day') day
        where extract(isodow from day)=m.day_of_week
          and (c.active_start_date is null or day::date>=c.active_start_date)
          and (c.active_end_date is null or day::date<=c.active_end_date)
        order by day limit 1
      ) d
      where cm.profile_id=auth.uid() and cm.status='active' and m.start_time is not null
        and ((d.meeting_date+m.start_time) at time zone 'America/New_York')>now()
        and not exists(
          select 1 from public.events cancellation
          where cancellation.published and cancellation.meeting_effect in('all','club')
            and (cancellation.meeting_effect='all' or cancellation.affected_club_id=c.id)
            and (cancellation.start_at at time zone 'America/New_York')::date<=d.meeting_date
            and (coalesce(cancellation.end_at,cancellation.start_at) at time zone 'America/New_York')::date>=d.meeting_date
        )
      order by starts_at limit 1
    ) nm),
    'preferences',coalesce((select jsonb_build_object('card_order',card_order,'hidden_cards',hidden_cards) from public.dashboard_preferences where user_id=auth.uid()),
      jsonb_build_object('card_order',array['meeting','attendance','registrations','deadlines','notifications'],'hidden_cards','{}'::text[]))
  ) end;
$$;
revoke all on function public.get_home_dashboard() from public,anon;
grant execute on function public.get_home_dashboard() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

commit;

-- ============================================================================
-- 52. request_notifications.sql
-- ============================================================================

-- Notify reviewers whenever a new request enters a review queue.
begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

alter table public.notifications enable row level security;
drop policy if exists "Users read notifications" on public.notifications;
drop policy if exists "Users mark notifications read" on public.notifications;
create policy "Users read notifications" on public.notifications for select using(user_id=auth.uid());
create policy "Users mark notifications read" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.notify_staff_of_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; request_title text; request_href text; request_kind text;
begin
  if tg_table_name='support_requests' then request_title:=new.subject; request_href:='/admin/support'; request_kind:='support_request';
  elsif tg_table_name='club_applications' then request_title:=new.club_name; request_href:='/admin/clubs'; request_kind:='club_application';
  else request_title:=new.title; request_href:='/admin/review'; request_kind:='announcement_review'; end if;
  for recipient in select id from public.profiles where role in ('staff','admin') loop
    insert into public.notifications(user_id,kind,title,body,href,dedupe_key)
    values(recipient.id,request_kind,'New request submitted',request_title,request_href,tg_table_name||':'||new.id::text)
    on conflict(user_id,dedupe_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists notify_support_request on public.support_requests;
create trigger notify_support_request after insert on public.support_requests for each row execute function public.notify_staff_of_request();
drop trigger if exists notify_club_application on public.club_applications;
create trigger notify_club_application after insert on public.club_applications for each row execute function public.notify_staff_of_request();
drop trigger if exists notify_announcement_request on public.school_announcement_submissions;
create trigger notify_announcement_request after insert on public.school_announcement_submissions for each row execute function public.notify_staff_of_request();

create or replace function public.notify_club_membership_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; club_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select name into club_name from public.clubs where id=new.club_id;
  for recipient in
    select profile_id from public.club_advisors where club_id=new.club_id
    union select profile_id from public.club_officers where club_id=new.club_id and profile_id is not null
  loop
    insert into public.notifications(user_id,kind,title,body,href,dedupe_key)
    values(recipient,'membership_request','New membership request',coalesce(club_name,'Club'),'/clubs/manage/'||new.club_id::text,'membership:'||new.id::text)
    on conflict(user_id,dedupe_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists notify_membership_request on public.club_memberships;
create trigger notify_membership_request after insert on public.club_memberships for each row execute function public.notify_club_membership_request();

commit;

-- ============================================================================
-- 53. club_profile_tags_club101.sql
-- ============================================================================

-- Detailed Club profiles and a strict three-tag taxonomy for discovery.
-- Run after core_platform.sql and custom_permissions.sql.
begin;

alter table public.clubs add column if not exists full_description text;
alter table public.clubs add column if not exists mission text;
alter table public.clubs add column if not exists activities text;
alter table public.clubs add column if not exists who_should_join text;
alter table public.clubs add column if not exists membership_expectations text;
alter table public.clubs add column if not exists weekly_commitment_hours numeric(4,1) not null default 0;

update public.clubs
set full_description=short_description
where full_description is null;

-- Older editors allowed more tags and did not normalize whitespace or duplicates.
-- Preserve the first three valid, case-insensitively unique tags in display order.
update public.clubs c set interest_tags=coalesce((
  select array_agg(clean order by ord) from (
    select clean,ord from (
      select distinct on(lower(btrim(value))) btrim(value) as clean,ord
      from unnest(c.interest_tags) with ordinality as u(value,ord)
      where value is not null and char_length(btrim(value)) between 2 and 30
      order by lower(btrim(value)),ord
    ) unique_tags order by ord limit 3
  ) kept
),array[case when c.is_stem then 'STEM' when c.is_community_service then 'Community Service' else 'Other' end]);

alter table public.clubs alter column full_description set not null;
alter table public.clubs drop constraint if exists clubs_full_description_check;
alter table public.clubs add constraint clubs_full_description_check
  check(char_length(btrim(full_description)) between 10 and 5000);
alter table public.clubs drop constraint if exists clubs_profile_sections_check;
alter table public.clubs add constraint clubs_profile_sections_check check(
  (mission is null or char_length(btrim(mission)) between 1 and 1500)
  and (activities is null or char_length(btrim(activities)) between 1 and 3000)
  and (who_should_join is null or char_length(btrim(who_should_join)) between 1 and 1500)
  and (membership_expectations is null or char_length(btrim(membership_expectations)) between 1 and 1500)
  and weekly_commitment_hours between 0 and 40
);

create or replace function public.valid_club_tags(tags text[])
returns boolean language plpgsql immutable set search_path=public as $$
declare tag text; normalized text[]:='{}';
begin
  if tags is null or cardinality(tags) not between 1 and 3 then return false; end if;
  foreach tag in array tags loop
    if tag is null or tag<>btrim(tag) or char_length(tag) not between 2 and 30 then return false; end if;
    if lower(tag)=any(normalized) then return false; end if;
    normalized:=array_append(normalized,lower(tag));
  end loop;
  return true;
end $$;
revoke all on function public.valid_club_tags(text[]) from public,anon,authenticated;

create or replace function public.fill_club_profile_defaults()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.full_description is null or btrim(new.full_description)='' then
    new.full_description:=new.short_description;
  end if;
  if new.interest_tags is null or cardinality(new.interest_tags)=0 then
    new.interest_tags:=array[case when new.is_stem then 'STEM' when new.is_community_service then 'Community Service' else 'Other' end];
  end if;
  return new;
end $$;
revoke all on function public.fill_club_profile_defaults() from public,anon,authenticated;
drop trigger if exists fill_club_profile_defaults on public.clubs;
create trigger fill_club_profile_defaults before insert or update of short_description,full_description,interest_tags,is_stem,is_community_service
on public.clubs for each row execute function public.fill_club_profile_defaults();

alter table public.clubs drop constraint if exists clubs_interest_tags_check;
alter table public.clubs add constraint clubs_interest_tags_check check(public.valid_club_tags(interest_tags));
create index if not exists clubs_interest_tags_gin_idx on public.clubs using gin(interest_tags);

commit;

-- ============================================================================
-- 54. club_profile_appearance.sql
-- ============================================================================

-- Per-Club public profile hero colors.
-- Apply after club_profile_tags_club101.sql.
begin;

alter table public.clubs add column if not exists profile_background_color text not null default '#f0ebe5';
alter table public.clubs add column if not exists profile_accent_color text not null default '#97b4de';

alter table public.clubs drop constraint if exists clubs_profile_background_color_check;
alter table public.clubs add constraint clubs_profile_background_color_check check(profile_background_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.clubs drop constraint if exists clubs_profile_accent_color_check;
alter table public.clubs add constraint clubs_profile_accent_color_check check(profile_accent_color ~ '^#[0-9A-Fa-f]{6}$');

commit;

-- ============================================================================
-- 55. support_conversations.sql
-- ============================================================================

-- Keep support request ordering current whenever either participant replies.
begin;
create or replace function public.touch_support_request_from_reply() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.support_requests set updated_at=now() where id=new.request_id;
  return new;
end $$;
drop trigger if exists support_reply_touch_request on public.support_request_updates;
create trigger support_reply_touch_request after insert on public.support_request_updates
for each row execute function public.touch_support_request_from_reply();
commit;

-- ============================================================================
-- 56. support_faqs.sql
-- ============================================================================

-- Public FAQs curated by administrators from resolved support conversations.
begin;

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  source_request_id uuid unique references public.support_requests(id) on delete set null,
  question text not null check (char_length(question) between 5 and 180),
  answer text not null check (char_length(answer) between 10 and 4000),
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_faqs_public_order_idx on public.support_faqs (published, sort_order, updated_at desc);
alter table public.support_faqs enable row level security;
drop policy if exists "Anyone reads published support FAQs" on public.support_faqs;
create policy "Anyone reads published support FAQs" on public.support_faqs for select using (published or public.is_staff_or_admin());
drop policy if exists "Admins manage support FAQs" on public.support_faqs;
create policy "Admins manage support FAQs" on public.support_faqs for all using (public.is_admin()) with check (public.is_admin());
grant select on public.support_faqs to anon, authenticated;
grant insert, update, delete on public.support_faqs to authenticated;

commit;

-- ============================================================================
-- 57. url_safe_club_slugs.sql
-- ============================================================================

-- Prefer readable Club URLs. A short application suffix is kept only when a
-- second Club would otherwise receive the same slug.
begin;

do $$
declare
  target record;
  clean_slug text;
begin
  for target in
    select id, slug, name
    from public.clubs
    where slug ~ '-[0-9a-f]{8}$'
    order by created_at, id
  loop
    clean_slug := trim(both '-' from regexp_replace(lower(target.name), '[^a-z0-9]+', '-', 'g'));
    if clean_slug <> '' and not exists (
      select 1 from public.clubs other
      where other.slug = clean_slug and other.id <> target.id
    ) then
      delete from public.club_interests duplicate
      using public.club_interests existing
      where duplicate.club_slug = target.slug
        and existing.club_slug = clean_slug
        and duplicate.user_id = existing.user_id;
      update public.club_interests set club_slug = clean_slug where club_slug = target.slug;
      update public.clubs set slug = clean_slug, updated_at = now() where id = target.id;
    end if;
  end loop;
end;
$$;

create or replace function public.promote_approved_club_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_slug text;
  selected_slug text;
  promoted_club_id uuid;
  teacher_name text;
  teacher_email text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.submitted_by is null or not exists (
      select 1 from public.profiles p where p.id = new.submitted_by and p.role = 'teacher'
    ) then
      raise exception 'Approved Club applications require a teacher applicant' using errcode = '23514';
    end if;

    base_slug := trim(both '-' from regexp_replace(lower(new.club_name), '[^a-z0-9]+', '-', 'g'));
    selected_slug := case when exists (select 1 from public.clubs where slug = base_slug)
      then base_slug || '-' || left(new.id::text, 8)
      else base_slug
    end;

    insert into public.clubs (
      slug, name, short_description, interest_tags, is_stem,
      is_community_service, contact_email, created_by, status
    ) values (
      selected_slug, new.club_name, new.description, array[new.category],
      new.category = 'STEM', new.category = 'Community Service',
      new.contact_email, new.submitted_by, 'published'
    )
    on conflict (slug) do update set
      name = excluded.name,
      short_description = excluded.short_description,
      interest_tags = excluded.interest_tags,
      is_stem = excluded.is_stem,
      is_community_service = excluded.is_community_service,
      contact_email = excluded.contact_email,
      status = 'published',
      updated_at = now()
    returning id into promoted_club_id;

    select p.full_name, p.email into teacher_name, teacher_email
    from public.profiles p where p.id = new.submitted_by;
    insert into public.club_advisors (club_id, profile_id, display_name, contact_email)
    values (promoted_club_id, new.submitted_by, teacher_name, teacher_email)
    on conflict (club_id, profile_id) do update set
      display_name = excluded.display_name,
      contact_email = excluded.contact_email;
  end if;
  return new;
end;
$$;

revoke all on function public.promote_approved_club_application() from public, anon, authenticated;

commit;

-- ============================================================================
-- 58. teacher_permissions.sql
-- ============================================================================

-- Merge legacy Staff/Advisor account roles into Teacher and add module grants.
-- Club advisor remains an independent assignment in club_advisors.
begin;

create table if not exists public.teacher_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check(permission in ('announcements.manage','opportunities.manage','events.manage','support.manage','site.manage')),
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(profile_id, permission)
);

-- Preserve the access legacy Staff accounts had before all faculty accounts
-- are normalized to Teacher. Legacy Advisors keep only their Club assignments.
insert into public.teacher_permissions(profile_id,permission,granted_by)
select p.id, permission, p.id
from public.profiles p
cross join unnest(array['announcements.manage','opportunities.manage','events.manage','support.manage','site.manage']::text[]) permission
where p.role='staff'
on conflict(profile_id,permission) do nothing;

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'teacher' where role in ('staff', 'advisor');
alter table public.profiles add constraint profiles_role_check check(role in ('student','teacher','admin'));
alter table public.teacher_permissions enable row level security;
drop policy if exists "Teachers read own permissions" on public.teacher_permissions;
create policy "Teachers read own permissions" on public.teacher_permissions for select using(profile_id=auth.uid() or public.is_admin());
drop policy if exists "Admins manage teacher permissions" on public.teacher_permissions;
create policy "Admins manage teacher permissions" on public.teacher_permissions for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.has_teacher_permission(p_permission text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.teacher_permissions tp join public.profiles p on p.id=tp.profile_id where tp.profile_id=auth.uid() and p.role='teacher' and tp.permission=p_permission);
$$;
create or replace function public.has_any_teacher_permission() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.teacher_permissions tp join public.profiles p on p.id=tp.profile_id where tp.profile_id=auth.uid() and p.role='teacher');
$$;
create or replace function public.set_teacher_permissions(p_profile_id uuid,p_permissions text[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admins only' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_profile_id and role='teacher') then raise exception 'Permissions may only be assigned to teachers' using errcode='23514'; end if;
 if not coalesce(p_permissions,'{}') <@ array['announcements.manage','opportunities.manage','events.manage','support.manage','site.manage']::text[] then raise exception 'Invalid permission' using errcode='23514'; end if;
 delete from public.teacher_permissions where profile_id=p_profile_id;
 insert into public.teacher_permissions(profile_id,permission,granted_by) select p_profile_id,permission,auth.uid() from unnest(coalesce(p_permissions,'{}')) permission;
end $$;
create or replace function public.set_teacher_clubs(p_profile_id uuid,p_club_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare teacher public.profiles;
begin
 if not public.is_admin() then raise exception 'Admins only' using errcode='42501'; end if;
 select * into teacher from public.profiles where id=p_profile_id and role='teacher';
 if not found then raise exception 'Club assignments may only be given to teachers' using errcode='23514'; end if;
 if exists(select 1 from unnest(coalesce(p_club_ids,'{}')) club_id left join public.clubs c on c.id=club_id where c.id is null) then raise exception 'Unknown Club' using errcode='23503'; end if;
 delete from public.club_advisors where profile_id=p_profile_id and not (club_id=any(coalesce(p_club_ids,'{}')));
 insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
 select distinct club_id,p_profile_id,teacher.full_name,teacher.email from unnest(coalesce(p_club_ids,'{}')) club_id
 on conflict(club_id,profile_id) do update set display_name=excluded.display_name,contact_email=excluded.contact_email;
end $$;
revoke all on function public.has_teacher_permission(text),public.has_any_teacher_permission(),public.set_teacher_permissions(uuid,text[]),public.set_teacher_clubs(uuid,uuid[]) from public,anon;
grant execute on function public.has_teacher_permission(text),public.has_any_teacher_permission(),public.set_teacher_permissions(uuid,text[]),public.set_teacher_clubs(uuid,uuid[]) to authenticated;
grant select,insert,update,delete on public.teacher_permissions to authenticated;

create or replace function public.assign_account_role(p_user_id uuid,p_role text,p_club_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare old_role text;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_role not in ('student','teacher','admin') then raise exception 'Invalid role'; end if;
 perform pg_advisory_xact_lock(761592);
 select role into old_role from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Account not found'; end if;
 if old_role='admin' and p_role<>'admin' and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'The last administrator cannot be demoted'; end if;
 update public.profiles set role=p_role where id=p_user_id;
 if p_role<>'teacher' then
  delete from public.teacher_permissions where profile_id=p_user_id;
  delete from public.club_advisors where profile_id=p_user_id;
 end if;
 insert into public.account_role_audit(actor_id,profile_id,previous_role,new_role,club_id) values(auth.uid(),p_user_id,old_role,p_role,null);
end $$;

drop policy if exists "Staff manage opportunities" on public.opportunities;
drop policy if exists "Authorized teachers manage opportunities" on public.opportunities;
create policy "Authorized teachers manage opportunities" on public.opportunities for all using(public.has_teacher_permission('opportunities.manage')) with check(public.has_teacher_permission('opportunities.manage'));
drop policy if exists "Staff manage announcements" on public.announcements;
drop policy if exists "Authorized teachers manage announcements" on public.announcements;
create policy "Authorized teachers manage announcements" on public.announcements for all using(public.has_teacher_permission('announcements.manage')) with check(public.has_teacher_permission('announcements.manage'));
drop policy if exists "Staff manage announcement history" on public.announcement_versions;
drop policy if exists "Authorized teachers manage announcement history" on public.announcement_versions;
create policy "Authorized teachers manage announcement history" on public.announcement_versions for all using(public.has_teacher_permission('announcements.manage')) with check(public.has_teacher_permission('announcements.manage'));
drop policy if exists "Staff own announcement drafts" on public.announcement_drafts;
drop policy if exists "Authorized teachers own announcement drafts" on public.announcement_drafts;
create policy "Authorized teachers own announcement drafts" on public.announcement_drafts for all using(user_id=auth.uid() and public.has_teacher_permission('announcements.manage')) with check(user_id=auth.uid() and public.has_teacher_permission('announcements.manage'));

drop policy if exists "Staff and club managers manage events" on public.events;
drop policy if exists "Authorized teachers and club managers manage events" on public.events;
create policy "Authorized teachers and club managers manage events" on public.events for all
 using(public.has_teacher_permission('events.manage') or (club_id is not null and public.can_manage_club(club_id)))
 with check(public.has_teacher_permission('events.manage') or (club_id is not null and public.can_manage_club(club_id)));
drop policy if exists "Staff manage support requests" on public.support_requests;
drop policy if exists "Authorized teachers manage support requests" on public.support_requests;
create policy "Authorized teachers manage support requests" on public.support_requests for update using(public.has_teacher_permission('support.manage')) with check(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers read support requests" on public.support_requests;
create policy "Authorized teachers read support requests" on public.support_requests for select using(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers read support updates" on public.support_request_updates;
create policy "Authorized teachers read support updates" on public.support_request_updates for select using(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers add support updates" on public.support_request_updates;
create policy "Authorized teachers add support updates" on public.support_request_updates for insert with check(author_id=auth.uid() and public.has_teacher_permission('support.manage'));
drop policy if exists "Manage site content" on public.site_content;
drop policy if exists "Authorized teachers manage site content" on public.site_content;
create policy "Authorized teachers manage site content" on public.site_content for all using(public.has_teacher_permission('site.manage')) with check(public.has_teacher_permission('site.manage'));
drop policy if exists "Editors own site drafts" on public.site_content_drafts;
create policy "Editors own site drafts" on public.site_content_drafts for all using(user_id=auth.uid() and public.has_teacher_permission('site.manage')) with check(user_id=auth.uid() and public.has_teacher_permission('site.manage'));
drop policy if exists "Editors manage site schedule" on public.site_content_scheduled;
create policy "Editors manage site schedule" on public.site_content_scheduled for all using(public.has_teacher_permission('site.manage')) with check(public.has_teacher_permission('site.manage'));
drop policy if exists "Editors read site versions" on public.site_content_versions;
create policy "Editors read site versions" on public.site_content_versions for select using(public.has_teacher_permission('site.manage'));

commit;
