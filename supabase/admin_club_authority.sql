-- Keep site authority separate from Club identity.
-- Admins can manage every Club through can_manage_club; they are not Advisors.

create or replace function public.validate_club_advisor_identity() returns trigger
language plpgsql security definer set search_path=public as $$
declare account_role text;
begin
  select role into account_role from public.profiles where id=new.profile_id;
  if account_role not in ('teacher','advisor') then
    raise exception 'Only Teacher or Advisor accounts may be listed as Club advisors' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_club_advisor_identity() from public,anon,authenticated;

-- Remove legacy rows that confused global Admin authority with Club Advisor identity.
delete from public.club_advisors a using public.profiles p
where p.id=a.profile_id and p.role in ('admin','staff');

drop trigger if exists validate_club_advisor_identity on public.club_advisors;
create trigger validate_club_advisor_identity before insert or update of profile_id
on public.club_advisors for each row execute function public.validate_club_advisor_identity();

-- Explicitly preserve global Admin/Staff access without creating identity rows.
create or replace function public.can_govern_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_staff_or_admin()
    or public.has_custom_permission('clubs.govern',p_club_id)
    or exists(select 1 from public.club_advisors where club_id=p_club_id and profile_id=auth.uid());
$$;
create or replace function public.can_manage_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.can_govern_club(p_club_id)
    or public.has_custom_permission('clubs.manage',p_club_id)
    or exists(select 1 from public.club_officers where club_id=p_club_id and profile_id=auth.uid() and (term_start is null or term_start<=current_date) and (term_end is null or term_end>=current_date));
$$;
