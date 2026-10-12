-- Production workflow completion: consent signatures, elections, private receipts,
-- staged permits, capacity-safe registration, import rollback, and notifications.
-- Run after school_operations.sql and operational_intelligence.sql.

alter table public.trip_consents add column if not exists guardian_name text;
alter table public.trip_consents add column if not exists guardian_email text;
alter table public.trip_consents add column if not exists guardian_signature text;
alter table public.trip_consents add column if not exists signed_at timestamptz;
alter table public.trip_consents add column if not exists document_path text;
alter table public.trip_consents add column if not exists due_at timestamptz;
alter table public.trip_consents add column if not exists reminder_sent_at timestamptz;
alter table public.club_reimbursements add column if not exists receipt_path text;
alter table public.club_elections add column if not exists opens_at timestamptz;
alter table public.club_elections add column if not exists closes_at timestamptz;
alter table public.club_elections add column if not exists results_locked_at timestamptz;

create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(), election_id uuid not null references public.club_elections(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, position text not null,
  statement text, status text not null default 'approved' check(status in('pending','approved','withdrawn','disqualified')),
  created_at timestamptz not null default now(), unique(election_id,profile_id,position)
);
create table if not exists public.election_ballots (
  id uuid primary key default gen_random_uuid(), election_id uuid not null references public.club_elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade, position text not null,
  candidate_id uuid not null references public.election_candidates(id) on delete restrict,
  created_at timestamptz not null default now(), unique(election_id,voter_id,position)
);
create table if not exists public.permit_approvals (
  id uuid primary key default gen_random_uuid(), permit_id uuid not null references public.facility_permits(id) on delete cascade,
  department text not null check(department in('room','security','library','av')), step_order integer not null check(step_order between 1 and 4),
  assigned_to uuid references public.profiles(id), status text not null default 'pending' check(status in('pending','approved','rejected','skipped')),
  note text, decided_by uuid references public.profiles(id), decided_at timestamptz, created_at timestamptz not null default now(),
  unique(permit_id,department), unique(permit_id,step_order)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, title text not null, body text not null, href text, read_at timestamptz,
  dedupe_key text, created_at timestamptz not null default now(), unique(user_id,dedupe_key)
);
create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key, notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check(channel in('email')), status text not null default 'pending' check(status in('pending','sent','failed','skipped')),
  attempts integer not null default 0, available_at timestamptz not null default now(), last_error text, sent_at timestamptz
);
create table if not exists public.club_import_batches (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id), file_name text not null,
  status text not null default 'preview' check(status in('preview','applied','rolled_back','failed')),
  total_rows integer not null default 0, valid_rows integer not null default 0, error_rows integer not null default 0,
  created_at timestamptz not null default now(), applied_at timestamptz, rolled_back_at timestamptz
);
create table if not exists public.club_import_rows (
  id bigint generated always as identity primary key, batch_id uuid not null references public.club_import_batches(id) on delete cascade,
  row_number integer not null, payload jsonb not null, errors text[] not null default '{}', before_state jsonb,
  club_id uuid references public.clubs(id) on delete set null, action text check(action in('insert','update')), unique(batch_id,row_number)
);

do $$ declare t text; begin foreach t in array array['election_candidates','election_ballots','permit_approvals','notifications','notification_outbox','club_import_batches','club_import_rows'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy "Boards manage candidates" on public.election_candidates for all using(exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id))) with check(exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id)));
create policy "Members view candidates" on public.election_candidates for select using(exists(select 1 from public.club_elections e join public.club_memberships m on m.club_id=e.club_id where e.id=election_id and m.profile_id=auth.uid() and m.status='active'));
create policy "Members cast ballots" on public.election_ballots for insert with check(voter_id=auth.uid() and exists(select 1 from public.club_elections e join public.club_memberships m on m.club_id=e.club_id where e.id=election_id and e.status='open' and e.results_locked_at is null and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>now()) and m.profile_id=auth.uid() and m.status='active'));
create policy "Voters view own ballot" on public.election_ballots for select using(voter_id=auth.uid() or exists(select 1 from public.club_elections e where e.id=election_id and public.can_manage_club(e.club_id) and e.results_locked_at is not null));
create policy "Permit participants read stages" on public.permit_approvals for select using(exists(select 1 from public.facility_permits p where p.id=permit_id and (public.can_manage_club(p.club_id) or public.is_staff_or_admin())));
create policy "Assigned approvers decide stage" on public.permit_approvals for update using(public.is_admin() or assigned_to=auth.uid());
create policy "Users read own notifications" on public.notifications for select using(user_id=auth.uid());
create policy "Users mark own notifications" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Admins manage notification delivery" on public.notification_outbox for all using(public.is_admin()) with check(public.is_admin());
create policy "Admins manage import batches" on public.club_import_batches for all using(public.is_admin()) with check(public.is_admin() and created_by=auth.uid());
create policy "Admins manage import rows" on public.club_import_rows for all using(public.is_admin()) with check(public.is_admin());
create policy "Members submit own trip consent" on public.trip_consents for update using(profile_id=auth.uid()) with check(profile_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('trip-consents','trip-consents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
 ('club-receipts','club-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Consent owners upload documents" on storage.objects for insert to authenticated with check(bucket_id='trip-consents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Consent owners read documents" on storage.objects for select to authenticated using(bucket_id='trip-consents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_staff_or_admin()));
create policy "Club managers upload receipts" on storage.objects for insert to authenticated with check(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Club governors read receipts" on storage.objects for select to authenticated using(bucket_id='club-receipts' and public.can_govern_club(((storage.foldername(name))[1])::uuid));

create or replace function public.register_for_event(p_approval_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare cap integer; approved_count integer; next_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select capacity into cap from public.event_approval_requests where id=p_approval_id and status='approved' for update;
  if not found then raise exception 'Event is not open'; end if;
  select count(*) into approved_count from public.event_registrations where approval_id=p_approval_id and status='approved';
  next_status:=case when cap is null or approved_count<cap then 'approved' else 'waitlisted' end;
  insert into public.event_registrations(approval_id,profile_id,status) values(p_approval_id,auth.uid(),next_status)
  on conflict(approval_id,profile_id) do update set status=excluded.status,reviewed_by=null,review_note=null;
  return next_status;
end $$;
grant execute on function public.register_for_event(uuid) to authenticated;

create or replace function public.cancel_event_registration(p_registration_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare aid uuid; promoted uuid;
begin
  update public.event_registrations set status='cancelled' where id=p_registration_id and (profile_id=auth.uid() or public.is_staff_or_admin()) returning approval_id into aid;
  if aid is null then raise exception 'Registration not found'; end if;
  select id into promoted from public.event_registrations where approval_id=aid and status='waitlisted' order by created_at for update skip locked limit 1;
  if promoted is not null then update public.event_registrations set status='approved',review_note='Automatically promoted from waitlist' where id=promoted; end if;
  return case when promoted is null then 'cancelled' else 'promoted' end;
end $$;
grant execute on function public.cancel_event_registration(uuid) to authenticated;

create or replace function public.cast_election_vote(p_election_id uuid,p_position text,p_candidate_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.election_candidates c join public.club_elections e on e.id=c.election_id join public.club_memberships m on m.club_id=e.club_id where c.id=p_candidate_id and c.election_id=p_election_id and c.position=p_position and c.status='approved' and e.status='open' and e.results_locked_at is null and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>now()) and m.profile_id=auth.uid() and m.status='active') then raise exception 'Voting is not open'; end if;
 insert into public.election_ballots(election_id,voter_id,position,candidate_id) values(p_election_id,auth.uid(),p_position,p_candidate_id) on conflict(election_id,voter_id,position) do update set candidate_id=excluded.candidate_id,created_at=now();
end $$;
grant execute on function public.cast_election_vote(uuid,text,uuid) to authenticated;

create or replace function public.lock_election_results(p_election_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; cid uuid; begin
 select club_id into cid from public.club_elections where id=p_election_id for update;
 if cid is null or not public.can_manage_club(cid) then raise exception 'Club board access required'; end if;
 select coalesce(jsonb_agg(x order by x.position,x.votes desc),'[]'::jsonb) into result from (select c.position,c.id candidate_id,p.full_name candidate_name,count(b.id) votes from public.election_candidates c join public.profiles p on p.id=c.profile_id left join public.election_ballots b on b.candidate_id=c.id where c.election_id=p_election_id and c.status='approved' group by c.position,c.id,p.full_name) x;
 update public.club_elections set status='completed',results_locked_at=now(),result_summary=result::text where id=p_election_id;
 return result;
end $$;
grant execute on function public.lock_election_results(uuid) to authenticated;

create or replace function public.recompute_permit_status() returns trigger language plpgsql security definer set search_path=public as $$
declare waiting integer; denied integer; begin
 select count(*) filter(where status='pending'),count(*) filter(where status='rejected') into waiting,denied from public.permit_approvals where permit_id=new.permit_id;
 update public.facility_permits set overall_status=case when denied>0 then 'rejected' when waiting=0 then 'approved' else 'pending' end,
 room_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='room'),'not_required'),
 security_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='security'),'not_required'),
 library_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='library'),'not_required'),
 av_status=coalesce((select status from public.permit_approvals where permit_id=new.permit_id and department='av'),'not_required') where id=new.permit_id;
 return new; end $$;
drop trigger if exists permit_stage_status on public.permit_approvals;
create trigger permit_stage_status after insert or update of status on public.permit_approvals for each row execute function public.recompute_permit_status();

create or replace function public.queue_notification(p_user_id uuid,p_kind text,p_title text,p_body text,p_href text default null,p_dedupe_key text default null,p_email boolean default true) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; begin
 insert into public.notifications(user_id,kind,title,body,href,dedupe_key) values(p_user_id,left(p_kind,60),left(p_title,160),left(p_body,2000),left(p_href,500),p_dedupe_key)
 on conflict(user_id,dedupe_key) do update set title=excluded.title,body=excluded.body,href=excluded.href returning id into nid;
 if p_email and not exists(select 1 from public.notification_outbox where notification_id=nid and channel='email') then insert into public.notification_outbox(notification_id,channel) values(nid,'email'); end if;
 return nid; end $$;
revoke all on function public.queue_notification(uuid,text,text,text,text,text,boolean) from public;
grant execute on function public.queue_notification(uuid,text,text,text,text,text,boolean) to service_role;

-- Reminder worker: invoke daily from Supabase Cron/Edge Function, then consume notification_outbox.
create or replace function public.queue_due_workflow_reminders() returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; begin
 for r in select tc.id,tc.profile_id,tc.due_at,t.title from public.trip_consents tc join public.club_trips t on t.id=tc.trip_id where tc.status='pending' and tc.due_at between now() and now()+interval '3 days' and tc.reminder_sent_at is null loop
   perform public.queue_notification(r.profile_id,'consent_due','Trip consent due',r.title||' consent is due soon.','/profile#trip-consent','consent:'||r.id,true);
   update public.trip_consents set reminder_sent_at=now() where id=r.id; n:=n+1;
 end loop; return n; end $$;
revoke all on function public.queue_due_workflow_reminders() from public;
grant execute on function public.queue_due_workflow_reminders() to service_role;
