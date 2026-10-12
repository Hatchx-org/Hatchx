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
