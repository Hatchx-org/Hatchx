-- Recruiting controls, durable membership history, and rejection conversations.
begin;

alter table public.clubs add column if not exists recruiting_status text not null default 'recruiting';
alter table public.clubs drop constraint if exists clubs_recruiting_status_check;
alter table public.clubs add constraint clubs_recruiting_status_check check (recruiting_status in ('recruiting', 'paused', 'closed'));

alter table public.club_memberships add column if not exists rejection_reason text;
alter table public.club_memberships add column if not exists member_reply text;
alter table public.club_memberships add column if not exists ended_at timestamptz;

create table if not exists public.club_membership_history (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.club_memberships(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.capture_membership_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status or old.rejection_reason is distinct from new.rejection_reason then
    insert into public.club_membership_history(membership_id,club_id,profile_id,previous_status,new_status,reason,changed_by)
    values(new.id,new.club_id,new.profile_id,case when tg_op='INSERT' then null else old.status end,new.status,new.rejection_reason,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists club_membership_history_trigger on public.club_memberships;
create trigger club_membership_history_trigger after insert or update on public.club_memberships for each row execute function public.capture_membership_history();

alter table public.club_membership_history enable row level security;
drop policy if exists "Members and managers read membership history" on public.club_membership_history;
create policy "Members and managers read membership history" on public.club_membership_history for select
using(profile_id=auth.uid() or public.can_manage_club(club_id));

create or replace function public.reply_to_membership_decision(p_membership_id uuid,p_reply text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if length(trim(coalesce(p_reply,''))) not between 1 and 1000 then return false; end if;
  update public.club_memberships set member_reply=trim(p_reply)
  where id=p_membership_id and profile_id=auth.uid() and status='rejected';
  return found;
end $$;
revoke all on function public.reply_to_membership_decision(uuid,text) from public,anon;
grant execute on function public.reply_to_membership_decision(uuid,text) to authenticated;

create index if not exists club_membership_history_member_created_idx on public.club_membership_history(profile_id,created_at desc);
commit;
