-- Backfill member display names and make Club chat use a recognizable,
-- non-email fallback for accounts that do not provide a full name.
begin;

update public.profiles profile
set full_name = coalesce(
  nullif(btrim(account.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(account.raw_user_meta_data ->> 'name'), ''),
  nullif(split_part(account.email, '@', 1), '')
)
from auth.users account
where profile.id = account.id
  and nullif(btrim(coalesce(profile.full_name, '')), '') is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  mapped_role text := 'student';
begin
  if lower(coalesce(new.email, '')) like '%@school.doe.gov'
     or lower(coalesce(new.email, '')) like '%@schools.nyc.gov' then
    mapped_role := 'advisor';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    mapped_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

create or replace function public.get_club_chat_messages(
  p_club_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  club_id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  can_delete boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.club_id,
    message.author_id,
    coalesce(nullif(btrim(profile.full_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'Club member') as author_name,
    profile.avatar_url as author_avatar_url,
    message.body,
    message.created_at,
    message.updated_at,
    (message.author_id = auth.uid() or public.can_manage_club(message.club_id)) as can_delete
  from public.club_messages message
  join public.profiles profile on profile.id = message.author_id
  where message.club_id = p_club_id
  order by message.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.get_club_chat_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_club_chat_messages(uuid, integer) to authenticated;

commit;
