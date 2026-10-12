-- Bayside-Hub production compatibility migration
-- Apply before admin_crud.sql/member_actions.sql/security_hardening.sql/core_platform.sql
-- when upgrading the original dashboard-created schema.

-- The original announcements table did not include archive state.
alter table public.announcements
  add column if not exists archived_at timestamptz;

-- Keep the original club-application columns for backwards compatibility while
-- adding and backfilling the canonical columns used by the application.
alter table public.club_applications
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists meeting_days text,
  add column if not exists status text;

update public.club_applications
set
  category = coalesce(
    category,
    case
      when club_category in (
        'Arts & Crafts', 'STEM', 'Community Service', 'Publications', 'Sports',
        'Music', 'Culture & Language', 'Debate & Government', 'Business', 'Other'
      ) then club_category
      else 'Other'
    end
  ),
  description = coalesce(description, club_description),
  meeting_days = coalesce(meeting_days, meeting_dates),
  status = coalesce(status, "club_appsStatus", 'pending');

alter table public.club_applications
  alter column category set default 'Other',
  alter column category set not null,
  alter column description set not null,
  alter column status set default 'pending',
  alter column status set not null;

alter table public.club_applications
  drop constraint if exists club_applications_canonical_status_check,
  add constraint club_applications_canonical_status_check
    check (status in ('pending', 'approved', 'rejected'));

-- The original clubs table is retained and expanded in place. Legacy columns
-- remain available, while new writes use the canonical columns below.
alter table public.clubs
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists short_description text,
  add column if not exists interest_tags text[],
  add column if not exists is_stem boolean,
  add column if not exists is_community_service boolean,
  add column if not exists active_start_date date,
  add column if not exists active_end_date date,
  add column if not exists google_classroom_code text,
  add column if not exists join_policy text,
  add column if not exists status text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.clubs
set
  slug = coalesce(
    slug,
    trim(both '-' from regexp_replace(lower(club_name), '[^a-z0-9]+', '-', 'g'))
      || '-' || left(id::text, 8)
  ),
  name = coalesce(name, club_name),
  short_description = coalesce(short_description, club_description),
  interest_tags = coalesce(interest_tags, array[coalesce(club_category, 'Other')]),
  is_stem = coalesce(is_stem, club_category = 'STEM'),
  is_community_service = coalesce(is_community_service, club_category = 'Community Service'),
  join_policy = coalesce(join_policy, 'approval_required'),
  status = coalesce(status, 'published'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.clubs
  alter column interest_tags set default '{}',
  alter column is_stem set default false,
  alter column is_community_service set default false,
  alter column join_policy set default 'approval_required',
  alter column status set default 'published',
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column slug set not null,
  alter column name set not null,
  alter column short_description set not null,
  alter column interest_tags set not null,
  alter column is_stem set not null,
  alter column is_community_service set not null,
  alter column join_policy set not null,
  alter column status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create unique index if not exists clubs_slug_key on public.clubs (slug);

alter table public.clubs
  drop constraint if exists clubs_join_policy_check,
  add constraint clubs_join_policy_check
    check (join_policy in ('instant', 'approval_required')),
  drop constraint if exists clubs_status_check,
  add constraint clubs_status_check
    check (status in ('draft', 'published', 'archived'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clubs'::regclass
      and conname = 'clubs_created_by_fkey'
  ) then
    alter table public.clubs
      add constraint clubs_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end;
$$;

-- Keep required legacy club columns populated when the canonical application
-- inserts or updates clubs, and populate canonical columns for any legacy
-- writer that is still active during the transition.
create or replace function public.sync_club_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := coalesce(new.name, new.club_name);
  new.club_name := coalesce(new.club_name, new.name);
  new.short_description := coalesce(new.short_description, new.club_description);
  new.club_description := coalesce(new.club_description, new.short_description);
  new.club_category := coalesce(new.interest_tags[1], new.club_category, 'Other');
  new.interest_tags := coalesce(new.interest_tags, array[new.club_category]);
  new."club_memberCount" := coalesce(new."club_memberCount", 0);
  return new;
end;
$$;

drop trigger if exists clubs_sync_legacy_columns on public.clubs;
create trigger clubs_sync_legacy_columns
  before insert or update on public.clubs
  for each row execute function public.sync_club_legacy_columns();

-- The original events table used event_* columns and a bigint primary key.
-- Preserve that key and those columns, while adding the canonical event fields
-- consumed by the Hub. Event RSVPs intentionally store event_id as text, so
-- both legacy bigint IDs and UUID IDs from fresh installations are supported.
alter table public.events
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists event_type text,
  add column if not exists club_id uuid,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists location text,
  add column if not exists price_label text,
  add column if not exists published boolean,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz;

update public.events
set
  title = coalesce(title, event_name, 'Untitled Event'),
  description = coalesce(description, event_description, ''),
  event_type = coalesce(event_type, 'other'),
  start_at = coalesce(
    start_at,
    (event_date + coalesce(event_time, time '00:00')) at time zone 'America/New_York',
    created_at
  ),
  location = coalesce(location, event_location),
  price_label = coalesce(price_label, event_price, 'Free'),
  published = coalesce(published, true),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.events
  alter column event_type set default 'other',
  alter column price_label set default 'Free',
  alter column published set default true,
  alter column updated_at set default now(),
  alter column title set not null,
  alter column description set not null,
  alter column event_type set not null,
  alter column start_at set not null,
  alter column price_label set not null,
  alter column published set not null,
  alter column updated_at set not null;

alter table public.events
  drop constraint if exists events_event_type_check,
  add constraint events_event_type_check
    check (event_type in ('school', 'club', 'sports', 'festival', 'spirit_week', 'other')),
  drop constraint if exists events_time_order_check,
  add constraint events_time_order_check
    check (end_at is null or end_at >= start_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_club_id_fkey'
  ) then
    alter table public.events
      add constraint events_club_id_fkey
      foreign key (club_id) references public.clubs (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_created_by_fkey'
  ) then
    alter table public.events
      add constraint events_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end;
$$;
