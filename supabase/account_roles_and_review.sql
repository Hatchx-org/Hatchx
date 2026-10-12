-- Apply after the existing platform migrations. Existing users retain roles.
begin;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('student','teacher','advisor','staff','admin'));
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,avatar_url,role) values(new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url',case when lower(split_part(new.email,'@',2)) in ('schools.nyc.gov','school.doe.gov') then 'teacher' else 'student' end) on conflict(id) do nothing;
 return new;
end $$;
create table if not exists public.account_role_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id),profile_id uuid references public.profiles(id),previous_role text,new_role text,club_id uuid references public.clubs(id),created_at timestamptz not null default now());
alter table public.account_role_audit enable row level security;
drop policy if exists "Admins read account role history" on public.account_role_audit;
create policy "Admins read account role history" on public.account_role_audit for select using(public.is_admin());

-- Serialize role changes, guard the final admin, and bind advisors atomically.
create or replace function public.assign_account_role(p_user_id uuid,p_role text,p_club_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare old_role text;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_role not in ('student','teacher','advisor','staff','admin') then raise exception 'Invalid role'; end if;
 perform pg_advisory_xact_lock(761592);
 select role into old_role from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Account not found'; end if;
 if old_role='admin' and p_role<>'admin' and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'The last administrator cannot be demoted'; end if;
 if p_role='advisor' then
  if p_club_id is null then raise exception 'Choose a club for this advisor'; end if;
  insert into public.club_advisors(club_id,profile_id) values(p_club_id,p_user_id) on conflict(club_id,profile_id) do nothing;
 elsif old_role='advisor' then delete from public.club_advisors where profile_id=p_user_id;
 end if;
 update public.profiles set role=p_role where id=p_user_id;
 insert into public.account_role_audit(actor_id,profile_id,previous_role,new_role,club_id) values(auth.uid(),p_user_id,old_role,p_role,p_club_id);
end $$;
create or replace function public.set_user_role(p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.assign_account_role(p_user_id,p_role,null); end $$;

create table if not exists public.school_announcement_submissions(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),author_id uuid not null references public.profiles(id),
 title text not null check(char_length(btrim(title)) between 3 and 120),body text not null check(char_length(btrim(body)) between 3 and 10000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),review_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 announcement_id uuid references public.announcements(id),created_at timestamptz not null default now());
alter table public.school_announcement_submissions enable row level security;
drop policy if exists "Authors and admins read submissions" on public.school_announcement_submissions;
create policy "Authors and admins read submissions" on public.school_announcement_submissions for select using(author_id=auth.uid() or public.is_admin());
drop policy if exists "Club leaders submit for review" on public.school_announcement_submissions;
create policy "Club leaders submit for review" on public.school_announcement_submissions for insert with check(author_id=auth.uid() and public.can_manage_club(club_id) and status='pending' and reviewed_by is null and reviewed_at is null and announcement_id is null and review_note is null);
create or replace function public.review_school_announcement(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare submission public.school_announcement_submissions; published_id uuid;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_approve is null then raise exception 'Choose approve or reject'; end if;
 select * into submission from public.school_announcement_submissions where id=p_id for update;
 if not found or submission.status<>'pending' then raise exception 'Submission is no longer pending'; end if;
 if not p_approve and char_length(btrim(coalesce(p_note,'')))<3 then raise exception 'Give a rejection reason'; end if;
 if p_approve then insert into public.announcements(title,body,tag,created_by,published) values(submission.title,submission.body,'Announcements',submission.author_id,true) returning id into published_id; end if;
 update public.school_announcement_submissions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,2000),announcement_id=published_id where id=p_id;
end $$;
revoke all on function public.assign_account_role(uuid,text,uuid),public.review_school_announcement(uuid,boolean,text) from public,anon;
grant execute on function public.assign_account_role(uuid,text,uuid),public.review_school_announcement(uuid,boolean,text) to authenticated;
grant select on public.account_role_audit to authenticated;
grant select,insert on public.school_announcement_submissions to authenticated;
commit;
