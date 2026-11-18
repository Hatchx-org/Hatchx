+-- Centralized Admin Club Management
-- Run once in a new Supabase SQL Editor query.
begin;

create index if not exists clubs_admin_status_name_idx
  on public.clubs (status, name);

create or replace function public.get_admin_club_member_counts(p_club_ids uuid[])
returns table(club_id uuid, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select membership.club_id, count(*)::bigint
  from public.club_memberships membership
  where public.is_admin()
    and membership.status = 'active'
    and membership.club_id = any(coalesce(p_club_ids, '{}'::uuid[]))
  group by membership.club_id;
$$;

revoke all on function public.get_admin_club_member_counts(uuid[]) from public, anon;
grant execute on function public.get_admin_club_member_counts(uuid[]) to authenticated;

create or replace function public.admin_delete_club(p_club_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
begin
  if not public.is_admin() then
    raise exception 'Administrators only';
  end if;

  select name into target_name
  from public.clubs
  where id = p_club_id and status = 'archived'
  for update;

  if target_name is null then
    return false;
  end if;

  -- These two older relations did not originally declare an ON DELETE action.
  -- All other Club-owned records use ON DELETE CASCADE (or SET NULL).
  delete from public.school_announcement_submissions where club_id = p_club_id;
  delete from public.account_role_audit where club_id = p_club_id;
  delete from public.clubs where id = p_club_id;
  return found;
end;
$$;

revoke all on function public.admin_delete_club(uuid) from public, anon;
grant execute on function public.admin_delete_club(uuid) to authenticated;

commit;
