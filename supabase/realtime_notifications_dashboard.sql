-- Realtime/PWA notifications and personalized dashboard details.
-- Run after member_actions.sql, school_operations.sql, workflow_completion.sql,
-- announcement_audience_notifications.sql, custom_permissions.sql,
-- club_attendance.sql, calendar_meeting_emergency.sql, and home_dashboard.sql.
begin;

alter table public.notifications add column if not exists deleted_at timestamptz;
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc) where deleted_at is null;
create index if not exists notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null and deleted_at is null;

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications for delete using(user_id=auth.uid());

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check(char_length(endpoint) between 20 and 2000),
  p256dh text not null check(char_length(p256dh) between 20 and 500),
  auth text not null check(char_length(auth) between 8 and 200),
  expires_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all
using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.push_subscriptions to authenticated;

create table if not exists public.push_notification_deliveries(
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  unique(notification_id,subscription_id)
);
create index if not exists push_delivery_queue_idx on public.push_notification_deliveries(status,available_at);
alter table public.push_notification_deliveries enable row level security;

create or replace function public.enqueue_push_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.push_notification_deliveries(notification_id,subscription_id)
  select new.id,s.id from public.push_subscriptions s
  where s.user_id=new.user_id and (s.expires_at is null or s.expires_at>now())
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_push_notification() from public,anon,authenticated;
drop trigger if exists notification_push_enqueue on public.notifications;
create trigger notification_push_enqueue after insert on public.notifications
for each row execute function public.enqueue_push_notification();

create or replace function public.claim_push_deliveries(p_limit integer default 50)
returns table(
  delivery_id bigint, notification_id uuid, subscription_id uuid,
  endpoint text, p256dh text, auth text, title text, body text, href text, kind text
) language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return query
  with claimed as (
    select d.id from public.push_notification_deliveries d
    where (
      d.status in ('pending','failed') and d.available_at<=now()
      or d.status='processing' and d.claimed_at<now()-interval '10 minutes'
    ) and d.attempts<5
    order by d.available_at,d.id for update skip locked limit greatest(1,least(p_limit,100))
  ), updated as (
    update public.push_notification_deliveries d set status='processing',claimed_at=now(),attempts=d.attempts+1
    from claimed where d.id=claimed.id returning d.*
  )
  select u.id,u.notification_id,u.subscription_id,s.endpoint,s.p256dh,s.auth,n.title,n.body,n.href,n.kind
  from updated u join public.push_subscriptions s on s.id=u.subscription_id
  join public.notifications n on n.id=u.notification_id;
end $$;
revoke all on function public.claim_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create table if not exists public.dashboard_preferences(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  card_order text[] not null default array['meeting','attendance','registrations','deadlines','notifications'],
  hidden_cards text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check(card_order <@ array['meeting','attendance','registrations','deadlines','notifications']::text[]),
  check(hidden_cards <@ array['meeting','attendance','registrations','deadlines','notifications']::text[])
);
alter table public.dashboard_preferences
  alter column card_order set default array['meeting','attendance','registrations','deadlines','notifications'];
update public.dashboard_preferences
set card_order=array_remove(card_order,'period'),
    hidden_cards=array_remove(hidden_cards,'period')
where 'period'=any(card_order) or 'period'=any(hidden_cards);
alter table public.dashboard_preferences enable row level security;
drop policy if exists "Users manage own dashboard preferences" on public.dashboard_preferences;
create policy "Users manage own dashboard preferences" on public.dashboard_preferences for all
using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.dashboard_preferences to authenticated;

create or replace function public.get_home_dashboard()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'active_clubs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name) order by c.name)
      from public.club_memberships m join public.clubs c on c.id=m.club_id where m.profile_id=auth.uid() and m.status='active'),'[]'::jsonb),
    'pending_memberships',(select count(*) from public.club_memberships where profile_id=auth.uid() and status='pending'),
    'pending_applications',(select count(*) from public.club_applications where submitted_by=auth.uid() and status='pending'),
    'open_support_requests',(select count(*) from public.support_requests where submitted_by=auth.uid() and status in('open','in_review')),
    'managed_club_count',(select count(*) from public.clubs c where public.can_manage_club(c.id)),
    'unread_notifications',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null and deleted_at is null),
    'recent_attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.checked_in_at desc) from (
      select r.id,s.label as session_label,c.name as club_name,c.slug as club_slug,r.checked_in_at
      from public.club_attendance_records r join public.club_attendance_sessions s on s.id=r.session_id join public.clubs c on c.id=r.club_id
      where r.profile_id=auth.uid() order by r.checked_in_at desc limit 3
    ) a),'[]'::jsonb),
    'registered_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.start_at) from (
      select ev.id::text,ev.title,ev.start_at,ev.location,'rsvp'::text as source
      from public.event_rsvps r join public.events ev on ev.id::text=r.event_id
      where r.user_id=auth.uid() and ev.published and ev.start_at>=now()
      union all
      select a.id::text,a.title,a.start_at,a.location,'registration'::text
      from public.event_registrations r join public.event_approval_requests a on a.id=r.approval_id
      where r.profile_id=auth.uid() and r.status in('approved','waitlisted') and a.start_at>=now()
      order by start_at limit 3
    ) e),'[]'::jsonb),
    'upcoming_deadlines',coalesce((select jsonb_agg(to_jsonb(o) order by o.deadline) from (
      select id,title,category,deadline from public.opportunities
      where status='published' and deadline between current_date and current_date+interval '45 days'
      order by deadline limit 3
    ) o),'[]'::jsonb),
    'next_meeting',(select to_jsonb(nm) from (
      select c.id as club_id,c.slug as club_slug,c.name as club_name,m.location,
        ((d.meeting_date+m.start_time) at time zone 'America/New_York') as starts_at
      from public.club_memberships cm join public.clubs c on c.id=cm.club_id
      join public.club_meetings m on m.club_id=c.id
      cross join lateral (
        select day::date as meeting_date from generate_series(current_date,current_date+14,interval '1 day') day
        where extract(isodow from day)=m.day_of_week
          and (c.active_start_date is null or day::date>=c.active_start_date)
          and (c.active_end_date is null or day::date<=c.active_end_date)
        order by day limit 1
      ) d
      where cm.profile_id=auth.uid() and cm.status='active' and m.start_time is not null
        and ((d.meeting_date+m.start_time) at time zone 'America/New_York')>now()
        and not exists(
          select 1 from public.events cancellation
          where cancellation.published and cancellation.meeting_effect in('all','club')
            and (cancellation.meeting_effect='all' or cancellation.affected_club_id=c.id)
            and (cancellation.start_at at time zone 'America/New_York')::date<=d.meeting_date
            and (coalesce(cancellation.end_at,cancellation.start_at) at time zone 'America/New_York')::date>=d.meeting_date
        )
      order by starts_at limit 1
    ) nm),
    'preferences',coalesce((select jsonb_build_object('card_order',card_order,'hidden_cards',hidden_cards) from public.dashboard_preferences where user_id=auth.uid()),
      jsonb_build_object('card_order',array['meeting','attendance','registrations','deadlines','notifications'],'hidden_cards','{}'::text[]))
  ) end;
$$;
revoke all on function public.get_home_dashboard() from public,anon;
grant execute on function public.get_home_dashboard() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

commit;
