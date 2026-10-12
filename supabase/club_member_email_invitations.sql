-- Email invitations for students who may not have registered yet.
-- Apply after club_social_links.sql and workflow_completion.sql.
begin;

create table if not exists public.club_member_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@nycstudents[.]net$'),
  personal_message text check(personal_message is null or char_length(personal_message)<=500),
  status text not null default 'pending' check(status in('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now()+interval '30 days'),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists club_member_pending_invitation_unique
on public.club_member_invitations(club_id,email) where status='pending';
create index if not exists club_member_invitations_email_idx on public.club_member_invitations(email,status,expires_at);

create table if not exists public.club_invitation_email_outbox (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references public.club_member_invitations(id) on delete cascade,
  to_email text not null,
  subject text not null check(char_length(subject) between 1 and 200),
  html_body text not null,
  text_body text not null,
  status text not null default 'pending' check(status in('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.club_member_invitations enable row level security;
alter table public.club_invitation_email_outbox enable row level security;
drop policy if exists "Managers manage Club member invitations" on public.club_member_invitations;
drop policy if exists "Managers manage Club invitation emails" on public.club_invitation_email_outbox;
create policy "Managers manage Club member invitations" on public.club_member_invitations for all
using(public.can_govern_club(club_id)) with check(public.can_govern_club(club_id) and invited_by=auth.uid());
create policy "Managers manage Club invitation emails" on public.club_invitation_email_outbox for all
using(exists(select 1 from public.club_member_invitations invitation where invitation.id=invitation_id and public.can_govern_club(invitation.club_id)))
with check(exists(select 1 from public.club_member_invitations invitation where invitation.id=invitation_id and public.can_govern_club(invitation.club_id)));
grant select,insert,update on public.club_member_invitations to authenticated;
grant select,insert,update on public.club_invitation_email_outbox to authenticated;
grant usage,select on sequence public.club_invitation_email_outbox_id_seq to authenticated;

create or replace function public.claim_pending_club_member_invitations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role<>'student' or lower(coalesce(new.email,'')) not like '%@nycstudents.net' then return new; end if;
  insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
  select distinct invitation.club_id,new.id,'active',now()
  from public.club_member_invitations invitation
  where invitation.email=lower(btrim(new.email)) and invitation.status='pending' and invitation.expires_at>now()
  on conflict(club_id,profile_id) do update set status='active',reviewed_at=now(),ended_at=null,rejection_reason=null;
  update public.club_member_invitations set status='accepted',claimed_profile_id=new.id,claimed_at=now()
  where email=lower(btrim(new.email)) and status='pending' and expires_at>now();
  update public.club_member_invitations set status='expired' where email=lower(btrim(new.email)) and status='pending' and expires_at<=now();
  return new;
end $$;
revoke all on function public.claim_pending_club_member_invitations() from public,anon,authenticated;
drop trigger if exists claim_pending_club_member_invitations on public.profiles;
create trigger claim_pending_club_member_invitations after insert or update of email,role on public.profiles
for each row execute function public.claim_pending_club_member_invitations();

create or replace function public.claim_club_member_invitation_for_existing_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare student_id uuid;
begin
  if new.status<>'pending' or new.expires_at<=now() then return new; end if;
  select id into student_id from public.profiles where email=new.email and role='student';
  if student_id is null then return new; end if;
  insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
  values(new.club_id,student_id,'active',now())
  on conflict(club_id,profile_id) do update set status='active',reviewed_at=now(),ended_at=null,rejection_reason=null;
  update public.club_member_invitations set status='accepted',claimed_profile_id=student_id,claimed_at=now() where id=new.id;
  return new;
end $$;
revoke all on function public.claim_club_member_invitation_for_existing_account() from public,anon,authenticated;
drop trigger if exists claim_club_member_invitation_for_existing_account on public.club_member_invitations;
create trigger claim_club_member_invitation_for_existing_account after insert or update of email,status,expires_at on public.club_member_invitations
for each row execute function public.claim_club_member_invitation_for_existing_account();

create or replace function public.claim_club_invitation_emails(p_limit integer default 25)
returns setof public.club_invitation_email_outbox language plpgsql security definer set search_path=public as $$
begin
  return query
  update public.club_invitation_email_outbox outbox set status='sending',attempts=attempts+1,claimed_at=now()
  where outbox.id in (
    select candidate.id from public.club_invitation_email_outbox candidate
    join public.club_member_invitations invitation on invitation.id=candidate.invitation_id
    where candidate.status in('pending','failed') and candidate.available_at<=now() and candidate.attempts<5
      and invitation.status in('pending','accepted')
    order by candidate.available_at,candidate.id for update skip locked limit least(greatest(p_limit,1),100)
  ) returning outbox.*;
end $$;
revoke all on function public.claim_club_invitation_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_club_invitation_emails(integer) to service_role;

commit;
