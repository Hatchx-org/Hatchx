-- Search analytics, operational errors, and broad administrative audit coverage.
begin;
create table if not exists public.search_analytics(id bigint generated always as identity primary key,query text not null check(char_length(query) between 2 and 80),normalized_query text not null check(char_length(normalized_query) between 2 and 80),result_count integer not null check(result_count>=0),user_id uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now());
create index if not exists search_analytics_zero_created_idx on public.search_analytics(created_at desc) where result_count=0;
create index if not exists search_analytics_query_idx on public.search_analytics(normalized_query,created_at desc);
alter table public.search_analytics enable row level security;
drop policy if exists "Admins read search analytics" on public.search_analytics;
create policy "Admins read search analytics" on public.search_analytics for select using(public.is_admin());
grant select on public.search_analytics to authenticated;
create or replace function public.record_search_analytics(p_query text,p_result_count integer) returns void language plpgsql security definer set search_path=public as $$ declare clean text:=left(trim(regexp_replace(coalesce(p_query,''),'\s+',' ','g')),80); begin if char_length(clean)<2 or p_result_count<0 then return; end if; insert into public.search_analytics(query,normalized_query,result_count,user_id) values(clean,lower(clean),p_result_count,auth.uid()); end $$;
revoke all on function public.record_search_analytics(text,integer) from public;
grant execute on function public.record_search_analytics(text,integer) to anon,authenticated;

create table if not exists public.system_errors(id bigint generated always as identity primary key,source text not null,message text not null,context jsonb not null default '{}',resolved_at timestamptz,created_at timestamptz not null default now());
create index if not exists system_errors_open_created_idx on public.system_errors(created_at desc) where resolved_at is null;
alter table public.system_errors enable row level security;
drop policy if exists "Admins read system errors" on public.system_errors;
create policy "Admins read system errors" on public.system_errors for select using(public.is_admin());
grant select on public.system_errors to authenticated;
create or replace function public.record_system_error(p_source text,p_message text,p_context jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$ begin if auth.uid() is null then return; end if; insert into public.system_errors(source,message,context) values(left(coalesce(nullif(trim(p_source),''),'application'),80),left(coalesce(nullif(trim(p_message),''),'Unknown error'),1000),coalesce(p_context,'{}')); end $$;
revoke all on function public.record_system_error(text,text,jsonb) from public;
grant execute on function public.record_system_error(text,text,jsonb) to authenticated;

alter table public.management_audit add column if not exists search_text text not null default '';
update public.management_audit set search_text=concat_ws(' ',resource,operation,before_data::text,after_data::text) where search_text='';
alter table public.management_audit add column if not exists search_vector tsvector generated always as(to_tsvector('simple',search_text)) stored;
create index if not exists management_audit_search_idx on public.management_audit using gin(search_vector);
create or replace function public.audit_management_change() returns trigger language plpgsql security definer set search_path=public as $$ declare before_value jsonb; after_value jsonb; begin before_value:=case when tg_op<>'INSERT' then to_jsonb(old) end; after_value:=case when tg_op<>'DELETE' then to_jsonb(new) end; insert into public.management_audit(actor_id,resource,operation,before_data,after_data,search_text) values(auth.uid(),tg_table_name,tg_op,before_value,after_value,concat_ws(' ',tg_table_name,tg_op,before_value::text,after_value::text)); return null; end $$;
do $$ declare table_name text; begin foreach table_name in array array['clubs','club_memberships','club_applications','support_requests','support_request_updates','opportunities','events'] loop execute format('drop trigger if exists %I on public.%I',table_name||'_global_audit',table_name); execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_management_change()',table_name||'_global_audit',table_name); end loop; end $$;
commit;
