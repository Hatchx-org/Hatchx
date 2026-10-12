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
