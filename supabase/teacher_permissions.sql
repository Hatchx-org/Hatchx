-- Merge legacy Staff/Advisor account roles into Teacher and add module grants.
-- Club advisor remains an independent assignment in club_advisors.
begin;

create table if not exists public.teacher_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check(permission in ('announcements.manage','opportunities.manage','events.manage','support.manage','site.manage')),
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(profile_id, permission)
);

-- Preserve the access legacy Staff accounts had before all faculty accounts
-- are normalized to Teacher. Legacy Advisors keep only their Club assignments.
insert into public.teacher_permissions(profile_id,permission,granted_by)
select p.id, permission, p.id
from public.profiles p
cross join unnest(array['announcements.manage','opportunities.manage','events.manage','support.manage','site.manage']::text[]) permission
where p.role='staff'
on conflict(profile_id,permission) do nothing;

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'teacher' where role in ('staff', 'advisor');
alter table public.profiles add constraint profiles_role_check check(role in ('student','teacher','admin'));
alter table public.teacher_permissions enable row level security;
drop policy if exists "Teachers read own permissions" on public.teacher_permissions;
create policy "Teachers read own permissions" on public.teacher_permissions for select using(profile_id=auth.uid() or public.is_admin());
drop policy if exists "Admins manage teacher permissions" on public.teacher_permissions;
create policy "Admins manage teacher permissions" on public.teacher_permissions for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.has_teacher_permission(p_permission text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.teacher_permissions tp join public.profiles p on p.id=tp.profile_id where tp.profile_id=auth.uid() and p.role='teacher' and tp.permission=p_permission);
$$;
create or replace function public.has_any_teacher_permission() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.teacher_permissions tp join public.profiles p on p.id=tp.profile_id where tp.profile_id=auth.uid() and p.role='teacher');
$$;
create or replace function public.set_teacher_permissions(p_profile_id uuid,p_permissions text[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admins only' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_profile_id and role='teacher') then raise exception 'Permissions may only be assigned to teachers' using errcode='23514'; end if;
 if not coalesce(p_permissions,'{}') <@ array['announcements.manage','opportunities.manage','events.manage','support.manage','site.manage']::text[] then raise exception 'Invalid permission' using errcode='23514'; end if;
 delete from public.teacher_permissions where profile_id=p_profile_id;
 insert into public.teacher_permissions(profile_id,permission,granted_by) select p_profile_id,permission,auth.uid() from unnest(coalesce(p_permissions,'{}')) permission;
end $$;
create or replace function public.set_teacher_clubs(p_profile_id uuid,p_club_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare teacher public.profiles;
begin
 if not public.is_admin() then raise exception 'Admins only' using errcode='42501'; end if;
 select * into teacher from public.profiles where id=p_profile_id and role='teacher';
 if not found then raise exception 'Club assignments may only be given to teachers' using errcode='23514'; end if;
 if exists(select 1 from unnest(coalesce(p_club_ids,'{}')) club_id left join public.clubs c on c.id=club_id where c.id is null) then raise exception 'Unknown Club' using errcode='23503'; end if;
 delete from public.club_advisors where profile_id=p_profile_id and not (club_id=any(coalesce(p_club_ids,'{}')));
 insert into public.club_advisors(club_id,profile_id,display_name,contact_email)
 select distinct club_id,p_profile_id,teacher.full_name,teacher.email from unnest(coalesce(p_club_ids,'{}')) club_id
 on conflict(club_id,profile_id) do update set display_name=excluded.display_name,contact_email=excluded.contact_email;
end $$;
revoke all on function public.has_teacher_permission(text),public.has_any_teacher_permission(),public.set_teacher_permissions(uuid,text[]),public.set_teacher_clubs(uuid,uuid[]) from public,anon;
grant execute on function public.has_teacher_permission(text),public.has_any_teacher_permission(),public.set_teacher_permissions(uuid,text[]),public.set_teacher_clubs(uuid,uuid[]) to authenticated;
grant select,insert,update,delete on public.teacher_permissions to authenticated;

create or replace function public.assign_account_role(p_user_id uuid,p_role text,p_club_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare old_role text;
begin
 if not public.is_admin() then raise exception 'Admins only'; end if;
 if p_role not in ('student','teacher','admin') then raise exception 'Invalid role'; end if;
 perform pg_advisory_xact_lock(761592);
 select role into old_role from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Account not found'; end if;
 if old_role='admin' and p_role<>'admin' and (select count(*) from public.profiles where role='admin')<=1 then raise exception 'The last administrator cannot be demoted'; end if;
 update public.profiles set role=p_role where id=p_user_id;
 if p_role<>'teacher' then
  delete from public.teacher_permissions where profile_id=p_user_id;
  delete from public.club_advisors where profile_id=p_user_id;
 end if;
 insert into public.account_role_audit(actor_id,profile_id,previous_role,new_role,club_id) values(auth.uid(),p_user_id,old_role,p_role,null);
end $$;

drop policy if exists "Staff manage opportunities" on public.opportunities;
drop policy if exists "Authorized teachers manage opportunities" on public.opportunities;
create policy "Authorized teachers manage opportunities" on public.opportunities for all using(public.has_teacher_permission('opportunities.manage')) with check(public.has_teacher_permission('opportunities.manage'));
drop policy if exists "Staff manage announcements" on public.announcements;
drop policy if exists "Authorized teachers manage announcements" on public.announcements;
create policy "Authorized teachers manage announcements" on public.announcements for all using(public.has_teacher_permission('announcements.manage')) with check(public.has_teacher_permission('announcements.manage'));
drop policy if exists "Staff manage announcement history" on public.announcement_versions;
drop policy if exists "Authorized teachers manage announcement history" on public.announcement_versions;
create policy "Authorized teachers manage announcement history" on public.announcement_versions for all using(public.has_teacher_permission('announcements.manage')) with check(public.has_teacher_permission('announcements.manage'));
drop policy if exists "Staff own announcement drafts" on public.announcement_drafts;
drop policy if exists "Authorized teachers own announcement drafts" on public.announcement_drafts;
create policy "Authorized teachers own announcement drafts" on public.announcement_drafts for all using(user_id=auth.uid() and public.has_teacher_permission('announcements.manage')) with check(user_id=auth.uid() and public.has_teacher_permission('announcements.manage'));

drop policy if exists "Staff and club managers manage events" on public.events;
drop policy if exists "Authorized teachers and club managers manage events" on public.events;
create policy "Authorized teachers and club managers manage events" on public.events for all
 using(public.has_teacher_permission('events.manage') or (club_id is not null and public.can_manage_club(club_id)))
 with check(public.has_teacher_permission('events.manage') or (club_id is not null and public.can_manage_club(club_id)));
drop policy if exists "Staff manage support requests" on public.support_requests;
drop policy if exists "Authorized teachers manage support requests" on public.support_requests;
create policy "Authorized teachers manage support requests" on public.support_requests for update using(public.has_teacher_permission('support.manage')) with check(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers read support requests" on public.support_requests;
create policy "Authorized teachers read support requests" on public.support_requests for select using(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers read support updates" on public.support_request_updates;
create policy "Authorized teachers read support updates" on public.support_request_updates for select using(public.has_teacher_permission('support.manage'));
drop policy if exists "Authorized teachers add support updates" on public.support_request_updates;
create policy "Authorized teachers add support updates" on public.support_request_updates for insert with check(author_id=auth.uid() and public.has_teacher_permission('support.manage'));
drop policy if exists "Manage site content" on public.site_content;
drop policy if exists "Authorized teachers manage site content" on public.site_content;
create policy "Authorized teachers manage site content" on public.site_content for all using(public.has_teacher_permission('site.manage')) with check(public.has_teacher_permission('site.manage'));
drop policy if exists "Editors own site drafts" on public.site_content_drafts;
create policy "Editors own site drafts" on public.site_content_drafts for all using(user_id=auth.uid() and public.has_teacher_permission('site.manage')) with check(user_id=auth.uid() and public.has_teacher_permission('site.manage'));
drop policy if exists "Editors manage site schedule" on public.site_content_scheduled;
create policy "Editors manage site schedule" on public.site_content_scheduled for all using(public.has_teacher_permission('site.manage')) with check(public.has_teacher_permission('site.manage'));
drop policy if exists "Editors read site versions" on public.site_content_versions;
create policy "Editors read site versions" on public.site_content_versions for select using(public.has_teacher_permission('site.manage'));

commit;
