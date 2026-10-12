-- CSV Club roster imports and deferred Advisor access claiming.
-- Apply after workflow_completion.sql and admin_club_authority.sql.
begin;

create table if not exists public.pending_club_advisors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  display_name text not null check(char_length(btrim(display_name)) between 2 and 120),
  created_by uuid not null references public.profiles(id),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(club_id,email)
);

create table if not exists public.club_import_related_records (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.club_import_batches(id) on delete cascade,
  import_row_id bigint not null references public.club_import_rows(id) on delete cascade,
  entity_type text not null check(entity_type in ('meeting','advisor','pending_advisor')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(batch_id,entity_type,entity_id)
);

alter table public.pending_club_advisors enable row level security;
alter table public.club_import_related_records enable row level security;
drop policy if exists "Admins manage pending Club advisors" on public.pending_club_advisors;
drop policy if exists "Admins manage import related records" on public.club_import_related_records;
create policy "Admins manage pending Club advisors" on public.pending_club_advisors for all using(public.is_admin()) with check(public.is_admin());
create policy "Admins manage import related records" on public.club_import_related_records for all using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.pending_club_advisors to authenticated;
grant select,insert,delete on public.club_import_related_records to authenticated;
grant usage,select on sequence public.club_import_related_records_id_seq to authenticated;

create or replace function public.claim_pending_club_advisories()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role not in ('teacher','advisor') or nullif(lower(btrim(new.email)),'') is null then return new; end if;
  insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
  select pending.club_id,new.id,pending.display_name,lower(btrim(new.email))
  from public.pending_club_advisors pending
  where pending.email=lower(btrim(new.email)) and pending.claimed_at is null
  on conflict(club_id,profile_id) do update set display_name=excluded.display_name,contact_email=excluded.contact_email;
  update public.pending_club_advisors set claimed_profile_id=new.id,claimed_at=now()
  where email=lower(btrim(new.email)) and claimed_at is null;
  return new;
end $$;
revoke all on function public.claim_pending_club_advisories() from public,anon,authenticated;

drop trigger if exists claim_pending_club_advisories on public.profiles;
create trigger claim_pending_club_advisories after insert or update of email,role on public.profiles
for each row execute function public.claim_pending_club_advisories();

commit;
