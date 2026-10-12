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
