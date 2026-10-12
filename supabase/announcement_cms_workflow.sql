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
