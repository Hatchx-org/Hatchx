-- Hatchx Quick Check-in, authentication onboarding, and editable profiles.
-- Safe to rerun on an existing Hatchx database after schema.sql.
begin;

-- Google creates the Auth user before Hatchx can collect student details. Allow
-- that provider to create an incomplete student profile; the application blocks
-- continuation until update_my_profile supplies OSIS and grade.
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
  google_account boolean := coalesce(new.raw_app_meta_data ->> 'provider','')='google';
  supplied_osis text;
  supplied_grade smallint;
  invite_value text;
  invite_row public.club_invite_codes%rowtype;
begin
  student_account := email_domain='nycstudents.net';
  if email_domain in ('school.doe.gov','schools.nyc.gov') then mapped_role := 'teacher'; end if;

  if student_account then
    supplied_osis := nullif(new.raw_user_meta_data ->> 'osis_number','');
    supplied_grade := nullif(new.raw_user_meta_data ->> 'grade_level','')::smallint;
    if not google_account and (supplied_osis is null or supplied_osis !~ '^\d{9}$' or supplied_grade not between 9 and 12) then
      raise exception 'Student OSIS and grade are required' using errcode='23514';
    end if;
  end if;

  insert into public.profiles(id,email,full_name,avatar_url,role,osis_number,grade_level)
  values(
    new.id,lower(btrim(new.email)),
    coalesce(new.raw_user_meta_data ->> 'full_name',new.raw_user_meta_data ->> 'name',split_part(new.email,'@',1)),
    new.raw_user_meta_data ->> 'avatar_url',mapped_role,
    case when student_account and supplied_osis ~ '^\d{9}$' then supplied_osis else null end,
    case when student_account and supplied_grade between 9 and 12 then supplied_grade else null end
  ) on conflict(id) do nothing;

  if jsonb_typeof(new.raw_user_meta_data -> 'invite_codes')='array' then
    for invite_value in select distinct upper(btrim(value)) from jsonb_array_elements_text(new.raw_user_meta_data -> 'invite_codes') value limit 8 loop
      select * into invite_row from public.club_invite_codes
      where code=invite_value and active and (expires_at is null or expires_at>now()) and (max_uses is null or use_count<max_uses)
      for update skip locked;
      if found then
        insert into public.club_memberships(club_id,profile_id,status,reviewed_at)
        values(invite_row.club_id,new.id,'active',now())
        on conflict(club_id,profile_id) do update set status='active',reviewed_at=now(),ended_at=null;
        insert into public.club_invite_redemptions(invite_id,club_id,profile_id)
        values(invite_row.id,invite_row.club_id,new.id) on conflict do nothing;
        if found then update public.club_invite_codes set use_count=use_count+1 where id=invite_row.id; end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.update_my_profile(
  p_full_name text,
  p_osis_number text default null,
  p_grade_level smallint default null,
  p_so_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  normalized_name text := regexp_replace(btrim(coalesce(p_full_name,'')),'\s+',' ','g');
  normalized_so text := nullif(btrim(coalesce(p_so_number,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into target from public.profiles where id=auth.uid() for update;
  if target.id is null then raise exception 'Profile not found' using errcode='P0002'; end if;
  if char_length(normalized_name) not between 2 and 120 or normalized_name ~ '[[:cntrl:]]' then raise exception 'Invalid full name' using errcode='23514'; end if;
  if normalized_so is not null and (char_length(normalized_so)>50 or normalized_so ~ '[[:cntrl:]]') then raise exception 'Invalid SO number' using errcode='23514'; end if;
  if target.role='student' and (coalesce(p_osis_number,'') !~ '^\d{9}$' or p_grade_level not between 9 and 12) then
    raise exception 'Student OSIS and grade are required' using errcode='23514';
  end if;
  update public.profiles set
    full_name=normalized_name,
    osis_number=case when target.role='student' then p_osis_number else target.osis_number end,
    grade_level=case when target.role='student' then p_grade_level else target.grade_level end,
    so_number=normalized_so
  where id=auth.uid();
end;
$$;
revoke all on function public.update_my_profile(text,text,smallint,text) from public,anon;
grant execute on function public.update_my_profile(text,text,smallint,text) to authenticated;

create or replace function public.get_club_check_in_status(p_code text)
returns table(status text,message text,club_id uuid,club_name text,club_slug text,session_label text,membership_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target public.club_attendance_sessions%rowtype;
  club_row public.clubs%rowtype;
  member_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select session.* into target from public.club_attendance_sessions session where upper(session.code)=upper(btrim(p_code)) limit 1;
  if target.id is null then return query select 'invalid','This check-in code is not valid.',null::uuid,null::text,null::text,null::text,null::text; return; end if;
  select * into club_row from public.clubs club where club.id=target.club_id;
  if not target.active then return query select 'closed','This check-in session has been closed.',club_row.id,club_row.name,club_row.slug,target.label,null::text; return; end if;
  if target.starts_at>now() then return query select 'scheduled','Check-in opens at '||to_char(target.starts_at at time zone 'America/New_York','Mon DD at FMHH12:MI AM')||'.',club_row.id,club_row.name,club_row.slug,target.label,null::text; return; end if;
  if target.expires_at is not null and target.expires_at<=now() then return query select 'expired','This check-in session has expired.',club_row.id,club_row.name,club_row.slug,target.label,null::text; return; end if;
  if exists(select 1 from public.club_attendance_records record where record.session_id=target.id and record.profile_id=auth.uid()) then
    return query select 'already_checked_in','Your attendance is already confirmed for this activity.',club_row.id,club_row.name,club_row.slug,target.label,'active'::text; return;
  end if;
  if public.can_manage_club(target.club_id) then return query select 'ready','You are eligible to check in.',club_row.id,club_row.name,club_row.slug,target.label,'active'::text; return; end if;
  select membership.status into member_status from public.club_memberships membership where membership.club_id=target.club_id and membership.profile_id=auth.uid();
  if member_status='active' then return query select 'ready','You are eligible to check in.',club_row.id,club_row.name,club_row.slug,target.label,member_status; return; end if;
  if member_status='pending' then return query select 'pending_member','Your membership is awaiting approval. You can check in after the Club approves it.',club_row.id,club_row.name,club_row.slug,target.label,member_status; return; end if;
  return query select 'not_member','Join this Club before checking in.',club_row.id,club_row.name,club_row.slug,target.label,member_status;
end;
$$;
revoke all on function public.get_club_check_in_status(text) from public,anon;
grant execute on function public.get_club_check_in_status(text) to authenticated;

create or replace function public.check_in_to_club(p_code text,p_comments text default null)
returns table(result text,message text,club_slug text,session_label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.club_attendance_sessions%rowtype;
  target_slug text;
  member_status text;
begin
  if auth.uid() is null then return query select 'unauthenticated','Sign in before checking in.',null::text,null::text; return; end if;
  if char_length(coalesce(p_comments,''))>1000 then return query select 'invalid','Comments must be 1,000 characters or fewer.',null::text,null::text; return; end if;
  select session.* into target from public.club_attendance_sessions session where upper(session.code)=upper(btrim(p_code)) limit 1 for update;
  if target.id is null then return query select 'invalid','This check-in code is not valid.',null::text,null::text; return; end if;
  select club.slug into target_slug from public.clubs club where club.id=target.club_id;
  if not target.active then return query select 'closed','This check-in session has been closed.',target_slug,target.label; return; end if;
  if target.starts_at>now() then return query select 'scheduled','Check-in opens at '||to_char(target.starts_at at time zone 'America/New_York','Mon DD at FMHH12:MI AM')||'.',target_slug,target.label; return; end if;
  if target.expires_at is not null and target.expires_at<=now() then return query select 'expired','This check-in session has expired.',target_slug,target.label; return; end if;
  if not public.can_manage_club(target.club_id) then
    select membership.status into member_status from public.club_memberships membership where membership.club_id=target.club_id and membership.profile_id=auth.uid();
    if member_status='pending' then return query select 'pending_member','Your membership is awaiting approval.',target_slug,target.label; return; end if;
    if member_status is distinct from 'active' then return query select 'not_member','Join this Club before checking in.',target_slug,target.label; return; end if;
  end if;
  insert into public.club_attendance_records(session_id,club_id,profile_id,comments)
  values(target.id,target.club_id,auth.uid(),nullif(btrim(p_comments),'')) on conflict(session_id,profile_id) do nothing;
  if found then return query select 'checked_in','Attendance confirmed.',target_slug,target.label;
  else return query select 'already_checked_in','Your attendance is already confirmed for this activity.',target_slug,target.label; end if;
end;
$$;
revoke all on function public.check_in_to_club(text,text) from public,anon;
grant execute on function public.check_in_to_club(text,text) to authenticated;

commit;
