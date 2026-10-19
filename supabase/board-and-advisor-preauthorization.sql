-- Board and Advisor email preauthorization.
-- Run once in Supabase SQL Editor after applying the current schema.sql.
begin;

alter table public.club_officers
  add column if not exists sort_order integer not null default 0;

create table if not exists public.pending_club_officers (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null unique references public.club_officers(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null check(
    email=lower(btrim(email))
    and char_length(email)<=254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  created_by uuid not null references public.profiles(id),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(club_id,email)
);

create index if not exists pending_club_officers_email_idx
  on public.pending_club_officers(email)
  where claimed_at is null;

alter table public.pending_club_officers enable row level security;
drop policy if exists "Governors manage pending Club officers" on public.pending_club_officers;
create policy "Governors manage pending Club officers"
on public.pending_club_officers
for all
using(public.can_govern_club(club_id))
with check(public.can_govern_club(club_id));
grant select,insert,update,delete on public.pending_club_officers to authenticated;

create or replace function public.preassign_club_officer(
  p_club_id uuid,
  p_email text,
  p_display_name text,
  p_title text,
  p_term_start date default null,
  p_term_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email,'')));
  normalized_name text := btrim(coalesce(p_display_name,''));
  target_profile public.profiles;
  officer_id uuid;
begin
  if not public.can_govern_club(p_club_id) then
    raise exception 'Club governance permission required' using errcode='42501';
  end if;
  if split_part(normalized_email,'@',2) not in ('nycstudents.net','school.doe.gov','schools.nyc.gov')
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(normalized_email)>254 then
    raise exception 'Use an approved school email' using errcode='23514';
  end if;
  if char_length(normalized_name) not between 2 and 120
     or char_length(btrim(coalesce(p_title,''))) not between 2 and 80
     or (p_term_start is not null and p_term_end is not null and p_term_end<p_term_start) then
    raise exception 'Invalid board assignment' using errcode='23514';
  end if;

  select * into target_profile
  from public.profiles
  where lower(btrim(email))=normalized_email
  limit 1;

  if exists(
    select 1 from public.pending_club_officers
    where club_id=p_club_id and email=normalized_email
  ) or (
    target_profile.id is not null and exists(
      select 1 from public.club_officers
      where club_id=p_club_id and profile_id=target_profile.id
    )
  ) then
    raise exception 'Email is already assigned to this Club board' using errcode='23505';
  end if;

  insert into public.club_officers(
    club_id,profile_id,display_name,title,term_start,term_end,sort_order
  )
  values(
    p_club_id,target_profile.id,
    coalesce(nullif(target_profile.full_name,''),normalized_name),
    btrim(p_title),p_term_start,p_term_end,
    coalesce((select max(sort_order)+10 from public.club_officers where club_id=p_club_id),10)
  )
  returning id into officer_id;

  if target_profile.id is null then
    insert into public.pending_club_officers(
      officer_id,club_id,email,created_by
    )
    values(officer_id,p_club_id,normalized_email,auth.uid());
  end if;

  return target_profile.id;
end;
$$;
revoke all on function public.preassign_club_officer(uuid,text,text,text,date,date)
  from public,anon;
grant execute on function public.preassign_club_officer(uuid,text,text,text,date,date)
  to authenticated;

create or replace function public.claim_preassigned_club_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(new.email,'')));
begin
  if normalized_email='' then return new; end if;

  if new.role in ('teacher','advisor') then
    insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
    select pending.club_id,new.id,pending.display_name,normalized_email
    from public.pending_club_advisors pending
    where pending.email=normalized_email and pending.claimed_at is null
    on conflict(club_id,profile_id) do update
      set display_name=excluded.display_name,
          contact_email=excluded.contact_email;

    update public.pending_club_advisors
    set claimed_profile_id=new.id,claimed_at=now()
    where email=normalized_email and claimed_at is null;
  end if;

  update public.club_officers officer
  set profile_id=new.id,
      display_name=coalesce(
        nullif(btrim(officer.display_name),''),
        nullif(btrim(new.full_name),''),
        normalized_email
      )
  from public.pending_club_officers pending
  where pending.officer_id=officer.id
    and pending.email=normalized_email
    and pending.claimed_at is null
    and officer.profile_id is null;

  update public.pending_club_officers
  set claimed_profile_id=new.id,claimed_at=now()
  where email=normalized_email and claimed_at is null;

  return new;
end;
$$;
revoke all on function public.claim_preassigned_club_roles()
  from public,anon,authenticated;

drop trigger if exists claim_pending_club_advisories on public.profiles;
drop trigger if exists claim_preassigned_club_roles on public.profiles;
create trigger claim_preassigned_club_roles
after insert or update of email,role on public.profiles
for each row execute function public.claim_preassigned_club_roles();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mapped_role text := 'student';
  email_domain text := lower(split_part(coalesce(new.email,''),'@',2));
  student_account boolean;
  supplied_osis text;
  supplied_grade smallint;
  invite_value text;
  invite_row public.club_invite_codes%rowtype;
begin
  student_account := email_domain='nycstudents.net';
  if email_domain in ('school.doe.gov','schools.nyc.gov') then
    mapped_role := 'teacher';
  end if;

  if student_account then
    supplied_osis := new.raw_user_meta_data ->> 'osis_number';
    supplied_grade := nullif(new.raw_user_meta_data ->> 'grade_level','')::smallint;
    if supplied_osis is null
       or supplied_osis !~ '^\d{9}$'
       or supplied_grade not between 9 and 12 then
      raise exception 'Student OSIS and grade are required' using errcode='23514';
    end if;
  end if;

  insert into public.profiles(
    id,email,full_name,avatar_url,role,osis_number,grade_level
  )
  values(
    new.id,lower(btrim(new.email)),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email,'@',1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    mapped_role,
    case when student_account then supplied_osis else null end,
    case when student_account then supplied_grade else null end
  )
  on conflict(id) do nothing;

  if jsonb_typeof(new.raw_user_meta_data -> 'invite_codes')='array' then
    for invite_value in
      select distinct upper(btrim(value))
      from jsonb_array_elements_text(new.raw_user_meta_data -> 'invite_codes') value
      limit 8
    loop
      select * into invite_row
      from public.club_invite_codes
      where code=invite_value
        and active
        and (expires_at is null or expires_at>now())
        and (max_uses is null or use_count<max_uses)
      for update skip locked;

      if found then
        insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
        values(invite_row.club_id,new.id,'active',now())
        on conflict(club_id,profile_id) do update
          set status='active',reviewed_at=now(),ended_at=null;

        insert into public.club_invite_redemptions(invite_id,club_id,profile_id)
        values(invite_row.id,invite_row.club_id,new.id)
        on conflict do nothing;

        if found then
          update public.club_invite_codes
          set use_count=use_count+1
          where id=invite_row.id;
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user()
  from public,anon,authenticated;

-- Repair accounts created while an older trigger classified staff domains as Advisor.
-- Admin accounts remain unchanged.
update public.profiles
set role='teacher'
where lower(split_part(coalesce(email,''),'@',2)) in (
  'school.doe.gov','schools.nyc.gov'
)
and role in ('student','advisor');

-- Claim older pending Advisor rows immediately.
insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
select pending.club_id,profile.id,pending.display_name,lower(btrim(profile.email))
from public.pending_club_advisors pending
join public.profiles profile
  on lower(btrim(profile.email))=pending.email
where pending.claimed_at is null
  and profile.role in ('teacher','advisor')
on conflict(club_id,profile_id) do update
  set display_name=excluded.display_name,
      contact_email=excluded.contact_email;

update public.pending_club_advisors pending
set claimed_profile_id=profile.id,claimed_at=now()
from public.profiles profile
where pending.claimed_at is null
  and lower(btrim(profile.email))=pending.email
  and profile.role in ('teacher','advisor');

commit;
