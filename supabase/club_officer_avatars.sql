-- Self-managed board portraits for the public "Meet the board" section.
-- Run after club_governance.sql.
begin;

alter table public.club_officers add column if not exists avatar_path text;
alter table public.club_officers drop constraint if exists club_officers_avatar_path_check;
alter table public.club_officers add constraint club_officers_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) between 10 and 500 and avatar_path !~ '(^|/)\.\.(/|$)'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('board-avatars','board-avatars',true,4194304,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_write_board_avatar(p_name text)
returns boolean language plpgsql security definer set search_path=public,storage stable as $$
declare parts text[]; target_club uuid; target_profile uuid;
begin
  if auth.uid() is null then return false; end if;
  parts:=storage.foldername(p_name);
  if cardinality(parts)<2 then return false; end if;
  target_club:=parts[1]::uuid; target_profile:=parts[2]::uuid;
  if public.can_govern_club(target_club) then return true; end if;
  return target_profile=auth.uid() and exists(
    select 1 from public.club_officers o where o.club_id=target_club and o.profile_id=auth.uid()
      and (o.term_start is null or o.term_start<=current_date)
      and (o.term_end is null or o.term_end>=current_date)
  );
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.can_write_board_avatar(text) from public;
grant execute on function public.can_write_board_avatar(text) to authenticated;

drop policy if exists "Public reads board avatars" on storage.objects;
create policy "Public reads board avatars" on storage.objects for select
  using(bucket_id='board-avatars');
drop policy if exists "Board members upload own avatars" on storage.objects;
create policy "Board members upload own avatars" on storage.objects for insert to authenticated
  with check(bucket_id='board-avatars' and public.can_write_board_avatar(name));
drop policy if exists "Board members replace own avatars" on storage.objects;
create policy "Board members replace own avatars" on storage.objects for update to authenticated
  using(bucket_id='board-avatars' and public.can_write_board_avatar(name))
  with check(bucket_id='board-avatars' and public.can_write_board_avatar(name));
drop policy if exists "Board members delete own avatars" on storage.objects;
create policy "Board members delete own avatars" on storage.objects for delete to authenticated
  using(bucket_id='board-avatars' and public.can_write_board_avatar(name));

create or replace function public.set_club_officer_avatar(p_officer_id uuid,p_avatar_path text)
returns text language plpgsql security definer set search_path=public as $$
declare officer public.club_officers; previous_path text;
begin
  select * into officer from public.club_officers where id=p_officer_id for update;
  if not found then raise exception 'Board member not found' using errcode='P0002'; end if;
  if not public.can_govern_club(officer.club_id) and not (
    officer.profile_id=auth.uid()
    and (officer.term_start is null or officer.term_start<=current_date)
    and (officer.term_end is null or officer.term_end>=current_date)
  ) then raise exception 'You may update only your own board portrait' using errcode='42501'; end if;
  if p_avatar_path is not null and (
    p_avatar_path not like officer.club_id::text||'/'||officer.profile_id::text||'/%'
    or char_length(p_avatar_path)>500 or p_avatar_path~'(^|/)\.\.(/|$)'
  ) then raise exception 'Invalid board portrait path' using errcode='23514'; end if;
  previous_path:=officer.avatar_path;
  update public.club_officers set avatar_path=p_avatar_path where id=p_officer_id;
  return previous_path;
end $$;
revoke all on function public.set_club_officer_avatar(uuid,text) from public;
grant execute on function public.set_club_officer_avatar(uuid,text) to authenticated;

commit;
