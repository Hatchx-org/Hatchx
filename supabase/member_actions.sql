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
