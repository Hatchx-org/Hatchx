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
