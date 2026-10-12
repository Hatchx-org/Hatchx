-- Notify reviewers whenever a new request enters a review queue.
begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

alter table public.notifications enable row level security;
drop policy if exists "Users read notifications" on public.notifications;
drop policy if exists "Users mark notifications read" on public.notifications;
create policy "Users read notifications" on public.notifications for select using(user_id=auth.uid());
create policy "Users mark notifications read" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.notify_staff_of_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; request_title text; request_href text; request_kind text;
begin
  if tg_table_name='support_requests' then request_title:=new.subject; request_href:='/admin/support'; request_kind:='support_request';
  elsif tg_table_name='club_applications' then request_title:=new.club_name; request_href:='/admin/clubs'; request_kind:='club_application';
  else request_title:=new.title; request_href:='/admin/review'; request_kind:='announcement_review'; end if;
  for recipient in select id from public.profiles where role in ('staff','admin') loop
    insert into public.notifications(user_id,kind,title,body,href,dedupe_key)
    values(recipient.id,request_kind,'New request submitted',request_title,request_href,tg_table_name||':'||new.id::text)
    on conflict(user_id,dedupe_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists notify_support_request on public.support_requests;
create trigger notify_support_request after insert on public.support_requests for each row execute function public.notify_staff_of_request();
drop trigger if exists notify_club_application on public.club_applications;
create trigger notify_club_application after insert on public.club_applications for each row execute function public.notify_staff_of_request();
drop trigger if exists notify_announcement_request on public.school_announcement_submissions;
create trigger notify_announcement_request after insert on public.school_announcement_submissions for each row execute function public.notify_staff_of_request();

create or replace function public.notify_club_membership_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; club_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select name into club_name from public.clubs where id=new.club_id;
  for recipient in
    select profile_id from public.club_advisors where club_id=new.club_id
    union select profile_id from public.club_officers where club_id=new.club_id and profile_id is not null
  loop
    insert into public.notifications(user_id,kind,title,body,href,dedupe_key)
    values(recipient,'membership_request','New membership request',coalesce(club_name,'Club'),'/clubs/manage/'||new.club_id::text,'membership:'||new.id::text)
    on conflict(user_id,dedupe_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists notify_membership_request on public.club_memberships;
create trigger notify_membership_request after insert on public.club_memberships for each row execute function public.notify_club_membership_request();

commit;
