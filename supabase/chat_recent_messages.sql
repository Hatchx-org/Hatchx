-- Apply after club_communication.sql. Keep the newest messages, oldest first.
begin;
create or replace function public.get_club_chat_messages(p_club_id uuid,p_limit integer default 100)
returns table(id uuid,club_id uuid,author_id uuid,author_name text,author_avatar_url text,body text,created_at timestamptz,updated_at timestamptz,can_delete boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.can_access_club_chat(p_club_id) then
  raise exception 'Club chat access denied' using errcode='42501';
 end if;
 return query
 select message.id,message.club_id,message.author_id,
 coalesce(nullif(profile.full_name,''),'Club member'),profile.avatar_url,
 message.body,message.created_at,message.updated_at,
 (message.author_id=auth.uid() or public.can_manage_club(message.club_id))
 from (
  select m.* from public.club_messages m where m.club_id=p_club_id
  order by m.created_at desc,m.id desc
  limit least(greatest(coalesce(p_limit,100),1),200)
 ) message join public.profiles profile on profile.id=message.author_id
 order by message.created_at asc,message.id asc;
end $$;
revoke all on function public.get_club_chat_messages(uuid,integer) from public,anon;
grant execute on function public.get_club_chat_messages(uuid,integer) to authenticated;
commit;
