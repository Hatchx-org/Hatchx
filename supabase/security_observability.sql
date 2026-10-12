-- Distributed abuse controls and production error reporting support.
-- Run after operational_intelligence.sql.
begin;

create table if not exists public.rate_limit_counters (
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, identifier_hash, window_start)
);
create index if not exists rate_limit_counters_cleanup_idx on public.rate_limit_counters(window_start);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public,anon,authenticated;

create or replace function public.check_rate_limit(p_scope text, p_identifier text default '') returns boolean
language plpgsql security definer set search_path=public as $$
declare
  max_requests integer;
  window_seconds integer;
  bucket timestamptz;
  identity text;
  current_count integer;
begin
  select limits.max_requests,limits.window_seconds into max_requests,window_seconds
  from (values
    ('search_api',60,60),
    ('analytics_api',120,60),
    ('error_report',10,300),
    ('support_submit',10,3600),
    ('announcement_submit',10,3600),
    ('event_registration',30,60),
    ('membership_action',30,60),
    ('club_application',5,86400)
  ) as limits(scope,max_requests,window_seconds)
  where limits.scope=p_scope;
  if max_requests is null then return false; end if;
  identity:=case when auth.uid() is not null then 'user:'||auth.uid()::text else 'client:'||left(coalesce(p_identifier,''),200) end;
  if auth.uid() is null and char_length(coalesce(p_identifier,''))<8 then return false; end if;
  bucket:=date_bin(make_interval(secs=>window_seconds),clock_timestamp(),timestamptz '2000-01-01');
  insert into public.rate_limit_counters(scope,identifier_hash,window_start,request_count)
  values(p_scope,md5(identity),bucket,1)
  on conflict(scope,identifier_hash,window_start) do update
    set request_count=public.rate_limit_counters.request_count+1
  returning request_count into current_count;
  if random()<0.01 then delete from public.rate_limit_counters where window_start<now()-interval '2 days'; end if;
  return current_count<=max_requests;
end $$;
revoke all on function public.check_rate_limit(text,text) from public;
grant execute on function public.check_rate_limit(text,text) to anon,authenticated;

-- Error reports remain write-only through the bounded function; Admins retain read access.
create or replace function public.record_system_error(p_source text,p_message text,p_context jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.system_errors(source,message,context)
  values(
    left(coalesce(nullif(trim(p_source),''),'application'),80),
    left(coalesce(nullif(trim(p_message),''),'Unknown error'),1000),
    jsonb_strip_nulls(coalesce(p_context,'{}')||jsonb_build_object('actor_id',auth.uid()))
  );
end $$;
revoke all on function public.record_system_error(text,text,jsonb) from public,anon;
grant execute on function public.record_system_error(text,text,jsonb) to authenticated;
drop policy if exists "Admins resolve system errors" on public.system_errors;
create policy "Admins resolve system errors" on public.system_errors for update
  using (public.is_admin()) with check (public.is_admin());
grant update(resolved_at) on public.system_errors to authenticated;

commit;
