-- Hatchx security hardening v2 for an existing database.
-- Safe to rerun. New projects already receive these definitions from schema.sql.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
    ('club_application',5,86400),
    ('public_form_submit',20,3600)
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

create or replace function public.get_public_custom_form(p_token text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'columns',t.columns,'club_name',c.name)
 from public.club_custom_form_links l join public.club_custom_tables t on t.id=l.table_id join public.clubs c on c.id=t.club_id
 where p_token ~ '^[A-Za-z0-9_-]{32}$'
   and l.token_hash=encode(extensions.digest(p_token::bytea,'sha256'::text),'hex') and l.active and (l.expires_at is null or l.expires_at>now())
 limit 1;
$$;

create or replace function public.submit_public_custom_form(p_token text,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_table uuid; target_columns jsonb; result_id uuid;
begin
 if p_token !~ '^[A-Za-z0-9_-]{32}$' then raise exception 'Form link is invalid or expired' using errcode='P0002'; end if;
 select l.table_id,t.columns into target_table,target_columns
 from public.club_custom_form_links l join public.club_custom_tables t on t.id=l.table_id
 where l.token_hash=encode(extensions.digest(p_token::bytea,'sha256'::text),'hex') and l.active and (l.expires_at is null or l.expires_at>now()) for update of l;
 if target_table is null then raise exception 'Form link is invalid or expired' using errcode='P0002'; end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid response' using errcode='23514'; end if;
 if octet_length(p_data::text)>65536 or (select count(*) from jsonb_object_keys(p_data))>30 then raise exception 'Response is too large' using errcode='23514'; end if;
 if exists(select 1 from jsonb_each(p_data) item where jsonb_typeof(item.value)='string' and char_length(item.value#>>'{}')>2000) then raise exception 'Response field is too long' using errcode='23514'; end if;
 if exists(
   select 1 from jsonb_object_keys(p_data) submitted(key)
   where not exists(select 1 from jsonb_array_elements(target_columns) column_definition where column_definition->>'key'=submitted.key)
 ) then raise exception 'Response contains an unknown field' using errcode='23514'; end if;
 insert into public.club_custom_table_rows(table_id,data,created_by) values(target_table,p_data,null) returning id into result_id;
 return result_id;
end $$;
revoke all on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) from public;
grant execute on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) to anon,authenticated;

commit;
