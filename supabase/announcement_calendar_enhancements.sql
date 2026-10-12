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
