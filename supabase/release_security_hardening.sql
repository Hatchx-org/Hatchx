-- Hatchx release security hardening.
-- Apply after club_governance.sql. This migration is idempotent.

-- The legacy directory view bypassed the caller's RLS context. The application
-- now reads the canonical public.clubs table, so remove the obsolete surface.
drop view if exists public.approved_clubs;

-- Public buckets serve objects by URL without a SELECT policy. Removing this
-- policy prevents anonymous clients from enumerating every stored object.
drop policy if exists "Public reads club media files" on storage.objects;

-- Repair the club audit trigger before tightening its execution privilege.
-- Trigger records have different shapes: `clubs` uses id, while child tables
-- use club_id. An IF branch prevents PostgreSQL from resolving the wrong field.
create or replace function public.log_club_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  row_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  row_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_club_id uuid;
  target_id uuid;
begin
  if tg_table_name = 'clubs' then
    target_club_id := coalesce(new.id, old.id);
  else
    target_club_id := coalesce(new.club_id, old.club_id);
  end if;
  target_id := coalesce(new.id, old.id);

  insert into public.club_audit_log (
    club_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_club_id, auth.uid(), lower(tg_op), tg_table_name, target_id, row_before, row_after
  );
  return coalesce(new, old);
end;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- broad grant, then explicitly restore only the RPC/helper access the app and
-- RLS policies require.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_staff_or_admin() from public, anon, authenticated;
revoke all on function public.set_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.can_govern_club(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_club(uuid) from public, anon, authenticated;
revoke all on function public.can_view_member_profile(uuid) from public, anon, authenticated;
revoke all on function public.club_interest_count(text) from public, anon, authenticated;
revoke all on function public.event_rsvp_count(text) from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff_or_admin() to anon, authenticated;
grant execute on function public.can_govern_club(uuid) to anon, authenticated;
grant execute on function public.can_manage_club(uuid) to anon, authenticated;
grant execute on function public.can_view_member_profile(uuid) to anon, authenticated;
grant execute on function public.club_interest_count(text) to anon, authenticated;
grant execute on function public.event_rsvp_count(text) to anon, authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Trigger functions must never be callable through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_profile_updated() from public, anon, authenticated;
revoke all on function public.capture_announcement_version() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.promote_approved_club_application() from public, anon, authenticated;
revoke all on function public.log_club_change() from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.sync_club_legacy_columns()') is not null then
    execute 'revoke all on function public.sync_club_legacy_columns() from public, anon, authenticated';
  end if;
end $$;

-- Pin trigger helper resolution to the intended schema. This prevents an
-- attacker-controlled search path from shadowing referenced database objects.
alter function public.handle_profile_updated() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
