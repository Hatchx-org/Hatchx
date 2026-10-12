-- Fast, permission-aware data for the signed-in home dashboard.
-- Run after custom_permissions.sql and the support/Club migrations.
begin;

create or replace function public.get_home_dashboard()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'active_clubs', coalesce((
      select jsonb_agg(
        jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name)
        order by c.name
      )
      from public.club_memberships m
      join public.clubs c on c.id=m.club_id
      where m.profile_id=auth.uid() and m.status='active'
    ), '[]'::jsonb),
    'pending_memberships', (
      select count(*) from public.club_memberships
      where profile_id=auth.uid() and status='pending'
    ),
    'pending_applications', (
      select count(*) from public.club_applications
      where submitted_by=auth.uid() and status='pending'
    ),
    'open_support_requests', (
      select count(*) from public.support_requests
      where submitted_by=auth.uid() and status in ('open','in_review')
    ),
    'managed_club_count', (
      select count(*) from public.clubs c
      where public.can_manage_club(c.id)
    )
  ) end;
$$;

revoke all on function public.get_home_dashboard() from public,anon;
grant execute on function public.get_home_dashboard() to authenticated;

commit;
