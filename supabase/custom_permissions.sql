-- Apply after account_roles_and_review.sql. Custom roles never imply admin.
begin;
create table if not exists public.custom_roles(id uuid primary key default gen_random_uuid(),name text unique not null check(char_length(btrim(name)) between 2 and 60),permissions text[] not null default '{}',created_at timestamptz not null default now(),check(permissions <@ array['clubs.manage','clubs.govern','site.manage']::text[]));
create table if not exists public.custom_role_assignments(id uuid primary key default gen_random_uuid(),role_id uuid not null references public.custom_roles(id) on delete cascade,profile_id uuid not null references public.profiles(id) on delete cascade,club_id uuid references public.clubs(id) on delete cascade,created_at timestamptz not null default now());
create unique index if not exists custom_role_assignment_unique on public.custom_role_assignments(role_id,profile_id,coalesce(club_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.custom_roles enable row level security;
alter table public.custom_role_assignments enable row level security;
drop policy if exists "Read custom roles" on public.custom_roles;
create policy "Read custom roles" on public.custom_roles for select to authenticated using(true);
drop policy if exists "Admin manage custom roles" on public.custom_roles;
create policy "Admin manage custom roles" on public.custom_roles for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Read assigned roles" on public.custom_role_assignments;
create policy "Read assigned roles" on public.custom_role_assignments for select using(profile_id=auth.uid() or public.is_admin());
drop policy if exists "Admin manage assigned roles" on public.custom_role_assignments;
create policy "Admin manage assigned roles" on public.custom_role_assignments for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.has_custom_permission(p_permission text,p_club_id uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.custom_role_assignments a join public.custom_roles r on r.id=a.role_id where a.profile_id=auth.uid() and p_permission=any(r.permissions) and (a.club_id is null or a.club_id=p_club_id));
$$;
-- A role assignment may delegate content editing or governance independently.
create or replace function public.can_govern_club(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_staff_or_admin() or public.has_custom_permission('clubs.govern',p_club_id) or exists(select 1 from public.club_advisors where club_id=p_club_id and profile_id=auth.uid());
$$;
create or replace function public.can_manage_club(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.can_govern_club(p_club_id) or public.has_custom_permission('clubs.manage',p_club_id) or exists(select 1 from public.club_officers where club_id=p_club_id and profile_id=auth.uid() and (term_start is null or term_start<=current_date) and (term_end is null or term_end>=current_date));
$$;
revoke all on function public.has_custom_permission(text,uuid) from public;
grant execute on function public.has_custom_permission(text,uuid) to anon,authenticated;
grant select,insert,update,delete on public.custom_roles,public.custom_role_assignments to authenticated;

-- Only public content belongs here. Never store keys or private contacts.
create table if not exists public.site_content(key text primary key check(key in ('home_intro','about_intro','support_intro','footer_note','support_faqs','manual_content')),body text not null check(char_length(body) between 1 and 4000),updated_by uuid references public.profiles(id),updated_at timestamptz not null default now());
alter table public.site_content enable row level security;
drop policy if exists "Public site content" on public.site_content;
create policy "Public site content" on public.site_content for select using(true);
drop policy if exists "Manage site content" on public.site_content;
create policy "Manage site content" on public.site_content for all using(public.is_admin() or public.has_custom_permission('site.manage',null)) with check(public.is_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content to anon,authenticated;
grant insert,update,delete on public.site_content to authenticated;

-- Resolve all authorized clubs in one request, including scoped custom roles.
create or replace function public.get_managed_club_ids() returns setof uuid
language sql stable security definer set search_path=public as $$
 select id from public.clubs where auth.uid() is not null and public.can_manage_club(id);
$$;
revoke all on function public.get_managed_club_ids() from public,anon;
grant execute on function public.get_managed_club_ids() to authenticated;

-- A content editor cannot publish/archive a club through direct API calls.
-- SQL Editor/service operations have no user id and retain maintenance access.
create or replace function public.guard_club_publication() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status and auth.uid() is not null and not public.is_staff_or_admin() then
  raise exception 'Only staff may change club publication status' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_club_publication() from public,anon,authenticated;
drop trigger if exists guard_club_publication on public.clubs;
create trigger guard_club_publication before update on public.clubs for each row execute function public.guard_club_publication();

-- Governance needs the club roster, but content-only editors do not get emails.
create or replace function public.can_view_member_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_staff_or_admin() or exists (
  select 1 from public.club_memberships m
  where m.profile_id=p_profile_id and public.can_govern_club(m.club_id)
 );
$$;

-- Append-only evidence for custom grants and public text changes.
create table if not exists public.management_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid,
 resource text not null, operation text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.management_audit enable row level security;
drop policy if exists "Admin read management audit" on public.management_audit;
create policy "Admin read management audit" on public.management_audit for select using(public.is_admin());
grant select on public.management_audit to authenticated;
create or replace function public.audit_management_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.management_audit(actor_id,resource,operation,before_data,after_data)
 values(auth.uid(),tg_table_name,tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return null;
end $$;
revoke all on function public.audit_management_change() from public,anon,authenticated;
drop trigger if exists custom_roles_audit on public.custom_roles;
create trigger custom_roles_audit after insert or update or delete on public.custom_roles for each row execute function public.audit_management_change();
drop trigger if exists custom_assignments_audit on public.custom_role_assignments;
create trigger custom_assignments_audit after insert or update or delete on public.custom_role_assignments for each row execute function public.audit_management_change();
drop trigger if exists site_content_audit on public.site_content;
create trigger site_content_audit after insert or update or delete on public.site_content for each row execute function public.audit_management_change();
commit;
