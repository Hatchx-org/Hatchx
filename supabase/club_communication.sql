-- Private club chat for approved members and club leadership.
-- Apply after club_governance.sql and release_security_hardening.sql.

create table if not exists public.club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_messages_club_created_idx
  on public.club_messages (club_id, created_at desc);

-- Keep the Club identifier available to authorized Realtime subscribers when
-- a row is deleted, so their open conversation can refresh correctly.
alter table public.club_messages replica identity full;

create or replace function public.can_access_club_chat(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.can_manage_club(p_club_id) or exists (
      select 1
      from public.club_memberships membership
      where membership.club_id = p_club_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
    )
  );
$$;

alter table public.club_messages enable row level security;

drop policy if exists "Club participants read messages" on public.club_messages;
create policy "Club participants read messages" on public.club_messages for select
  using (public.can_access_club_chat(club_id));

drop policy if exists "Club participants post messages" on public.club_messages;
create policy "Club participants post messages" on public.club_messages for insert
  with check (
    author_id = auth.uid()
    and public.can_access_club_chat(club_id)
  );

drop policy if exists "Authors and managers delete messages" on public.club_messages;
create policy "Authors and managers delete messages" on public.club_messages for delete
  using (author_id = auth.uid() or public.can_manage_club(club_id));

-- Return only the profile fields needed by chat. This avoids exposing member
-- email addresses while still showing recognizable names and avatars.
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

revoke all on function public.can_access_club_chat(uuid) from public, anon, authenticated;
revoke all on function public.get_club_chat_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.can_access_club_chat(uuid) to authenticated;
grant execute on function public.get_club_chat_messages(uuid, integer) to authenticated;

-- Supabase Realtime refreshes the open conversation when another participant
-- posts or removes a message. The block is safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_messages'
  ) then
    alter publication supabase_realtime add table public.club_messages;
  end if;
end $$;
