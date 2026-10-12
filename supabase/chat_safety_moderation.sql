-- Club chat rules, posting restrictions, restoration, and immutable moderation history.
-- Apply after club_communication.sql and chat_member_names.sql.

begin;

create table if not exists public.club_chat_agreements (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

create table if not exists public.club_chat_restrictions (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  restricted boolean not null default true,
  reason text,
  restricted_by uuid references public.profiles (id) on delete set null,
  restricted_at timestamptz,
  restored_by uuid references public.profiles (id) on delete set null,
  restored_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (club_id, profile_id),
  check (reason is null or char_length(btrim(reason)) between 3 and 500),
  check (not restricted or (reason is not null and restricted_at is not null))
);

create table if not exists public.club_chat_moderation_log (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('restricted', 'restored')),
  reason text,
  created_at timestamptz not null default now(),
  check (reason is null or char_length(btrim(reason)) between 3 and 500)
);

create index if not exists club_chat_moderation_log_club_created_idx
  on public.club_chat_moderation_log (club_id, created_at desc);

create or replace function public.can_moderate_club_chat(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    or exists (
      select 1 from public.club_advisors
      where club_id = p_club_id and profile_id = auth.uid()
    )
  );
$$;

create or replace function public.has_accepted_club_chat_rules(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.club_chat_agreements
    where club_id = p_club_id
      and profile_id = auth.uid()
      and policy_version = p_policy_version
  );
$$;

create or replace function public.is_club_chat_restricted(p_club_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select restricted from public.club_chat_restrictions
    where club_id = p_club_id and profile_id = p_profile_id
  ), false);
$$;

create or replace function public.can_post_club_chat(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.can_access_club_chat(p_club_id)
    and public.has_accepted_club_chat_rules(p_club_id, p_policy_version)
    and not public.is_club_chat_restricted(p_club_id, auth.uid());
$$;

create or replace function public.accept_club_chat_rules(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;
  if p_policy_version <> '2026-10-11' then
    raise exception 'Unsupported chat policy version' using errcode = '22023';
  end if;

  insert into public.club_chat_agreements (club_id, profile_id, policy_version, accepted_at)
  values (p_club_id, auth.uid(), p_policy_version, now())
  on conflict (club_id, profile_id) do update set
    policy_version = excluded.policy_version,
    accepted_at = excluded.accepted_at;
end;
$$;

create or replace function public.set_club_chat_restriction(
  p_club_id uuid,
  p_profile_id uuid,
  p_restricted boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_moderate_club_chat(p_club_id) then
    raise exception 'Chat moderation denied' using errcode = '42501';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'Moderators cannot change their own chat access' using errcode = '22023';
  end if;
  if p_restricted and (normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500) then
    raise exception 'A reason between 3 and 500 characters is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where club_id = p_club_id and profile_id = p_profile_id and status = 'active'
  ) then
    raise exception 'Only active Club members can be moderated' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_profile_id and role = 'admin')
     or exists (select 1 from public.club_advisors where club_id = p_club_id and profile_id = p_profile_id) then
    raise exception 'Advisor and Admin access must be changed through account governance' using errcode = '22023';
  end if;

  insert into public.club_chat_restrictions (
    club_id, profile_id, restricted, reason, restricted_by, restricted_at,
    restored_by, restored_at, updated_at
  ) values (
    p_club_id, p_profile_id, p_restricted,
    case when p_restricted then normalized_reason else null end,
    case when p_restricted then auth.uid() else null end,
    case when p_restricted then now() else null end,
    case when p_restricted then null else auth.uid() end,
    case when p_restricted then null else now() end,
    now()
  )
  on conflict (club_id, profile_id) do update set
    restricted = excluded.restricted,
    reason = excluded.reason,
    restricted_by = excluded.restricted_by,
    restricted_at = excluded.restricted_at,
    restored_by = excluded.restored_by,
    restored_at = excluded.restored_at,
    updated_at = now();

  insert into public.club_chat_moderation_log (club_id, profile_id, actor_id, action, reason)
  values (p_club_id, p_profile_id, auth.uid(), case when p_restricted then 'restricted' else 'restored' end, normalized_reason);
end;
$$;

create or replace function public.get_club_chat_state(
  p_club_id uuid,
  p_policy_version text default '2026-10-11'
)
returns table (
  agreed boolean,
  restricted boolean,
  restriction_reason text,
  can_moderate boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_access_club_chat(p_club_id) then
    raise exception 'Club chat access denied' using errcode = '42501';
  end if;
  return query select
    public.has_accepted_club_chat_rules(p_club_id, p_policy_version),
    public.is_club_chat_restricted(p_club_id, auth.uid()),
    (select reason from public.club_chat_restrictions where club_id = p_club_id and profile_id = auth.uid() and club_chat_restrictions.restricted),
    public.can_moderate_club_chat(p_club_id);
end;
$$;

create or replace function public.get_club_chat_moderation_members(p_club_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  restricted boolean,
  restriction_reason text,
  restricted_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.can_moderate_club_chat(p_club_id) then
    raise exception 'Chat moderation denied' using errcode = '42501';
  end if;
  return query
  select membership.profile_id,
    coalesce(nullif(btrim(profile.full_name), ''), 'Club member'),
    coalesce(restriction.restricted, false),
    restriction.reason,
    restriction.restricted_at
  from public.club_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  left join public.club_chat_restrictions restriction
    on restriction.club_id = membership.club_id and restriction.profile_id = membership.profile_id
  where membership.club_id = p_club_id
    and membership.status = 'active'
    and profile.role <> 'admin'
    and not exists (
      select 1 from public.club_advisors advisor
      where advisor.club_id = p_club_id and advisor.profile_id = membership.profile_id
    )
  order by coalesce(nullif(btrim(profile.full_name), ''), 'Club member');
end;
$$;

alter table public.club_chat_agreements enable row level security;
alter table public.club_chat_restrictions enable row level security;
alter table public.club_chat_moderation_log enable row level security;

drop policy if exists "Members read own chat agreement" on public.club_chat_agreements;
create policy "Members read own chat agreement" on public.club_chat_agreements for select
  using (profile_id = auth.uid() or public.can_moderate_club_chat(club_id));

drop policy if exists "Members read relevant chat restriction" on public.club_chat_restrictions;
create policy "Members read relevant chat restriction" on public.club_chat_restrictions for select
  using (profile_id = auth.uid() or public.can_moderate_club_chat(club_id));

drop policy if exists "Moderators read chat history" on public.club_chat_moderation_log;
create policy "Moderators read chat history" on public.club_chat_moderation_log for select
  using (public.can_moderate_club_chat(club_id));

drop policy if exists "Club participants post messages" on public.club_messages;
drop policy if exists "Rule-accepting unrestricted participants post messages" on public.club_messages;
create policy "Rule-accepting unrestricted participants post messages" on public.club_messages for insert
  with check (
    author_id = auth.uid()
    and public.can_post_club_chat(club_id, '2026-10-11')
  );

revoke all on function public.can_moderate_club_chat(uuid) from public, anon, authenticated;
revoke all on function public.has_accepted_club_chat_rules(uuid, text) from public, anon, authenticated;
revoke all on function public.is_club_chat_restricted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_post_club_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_club_chat_rules(uuid, text) from public, anon, authenticated;
revoke all on function public.set_club_chat_restriction(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.get_club_chat_state(uuid, text) from public, anon, authenticated;
revoke all on function public.get_club_chat_moderation_members(uuid) from public, anon, authenticated;

grant execute on function public.can_moderate_club_chat(uuid) to authenticated;
grant execute on function public.has_accepted_club_chat_rules(uuid, text) to authenticated;
grant execute on function public.is_club_chat_restricted(uuid, uuid) to authenticated;
grant execute on function public.can_post_club_chat(uuid, text) to authenticated;
grant execute on function public.accept_club_chat_rules(uuid, text) to authenticated;
grant execute on function public.set_club_chat_restriction(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.get_club_chat_state(uuid, text) to authenticated;
grant execute on function public.get_club_chat_moderation_members(uuid) to authenticated;

commit;
