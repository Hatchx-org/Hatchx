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
