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
    check (event_type in ('school', 'club', 'sports', 'festival', 'spirit_week', 'other')),
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
create policy "Staff manage announcements" on public.announcements for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists "Admins review applications" on public.club_applications;
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
  ('Spirit Week', 'Five themed days celebrating Bayside school spirit.', 'spirit_week', now() + interval '84 days', now() + interval '88 days', 'Throughout the school', 'Free'),
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
