-- Editing and richer field types for Club custom tables.
-- Run after club_custom_tables.sql.
begin;

create or replace function public.validate_club_custom_table_columns() returns trigger
language plpgsql security definer set search_path=public as $$
declare item jsonb; option_value jsonb; seen text[] := '{}'; label_seen text[] := '{}'; option_seen text[];
begin
  for item in select value from jsonb_array_elements(new.columns) loop
    if jsonb_typeof(item)<>'object'
      or coalesce(item->>'key','') !~ '^column_[1-9][0-9]*$'
      or char_length(btrim(coalesce(item->>'label',''))) not between 1 and 80
      or coalesce(item->>'type','') not in ('text','long_text','number','date','checkbox','email','url','select')
      or coalesce(jsonb_typeof(item->'required'),'') <> 'boolean'
      or lower(btrim(item->>'label'))=any(label_seen)
      or item->>'key'=any(seen) then
      raise exception 'Invalid custom table column definition' using errcode='23514';
    end if;
    if item->>'type'='select' then
      if coalesce(jsonb_typeof(item->'options'),'')<>'array' or jsonb_array_length(item->'options') not between 1 and 50 then
        raise exception 'Select columns require 1 to 50 options' using errcode='23514';
      end if;
      option_seen:='{}';
      for option_value in select value from jsonb_array_elements(item->'options') loop
        if jsonb_typeof(option_value)<>'string' or char_length(btrim(option_value#>>'{}')) not between 1 and 100 or lower(option_value#>>'{}')=any(option_seen) then
          raise exception 'Select options must be unique text values' using errcode='23514';
        end if;
        option_seen:=array_append(option_seen,lower(option_value#>>'{}'));
      end loop;
    end if;
    seen:=array_append(seen,item->>'key');
    label_seen:=array_append(label_seen,lower(btrim(item->>'label')));
  end loop;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_columns() from public,anon,authenticated;

create or replace function public.validate_club_custom_table_row() returns trigger
language plpgsql security definer set search_path=public as $$
declare definitions jsonb; item jsonb; cell jsonb; allowed text[] := '{}'; text_value text;
begin
  select columns into definitions from public.club_custom_tables where id=new.table_id;
  if definitions is null then raise exception 'Custom table not found' using errcode='23503'; end if;
  for item in select value from jsonb_array_elements(definitions) loop
    allowed:=array_append(allowed,item->>'key'); cell:=new.data->(item->>'key'); text_value:=cell#>>'{}';
    if coalesce((item->>'required')::boolean,false) and (cell is null or cell='""'::jsonb) and item->>'type'<>'checkbox' then raise exception 'Required custom table value is missing' using errcode='23514'; end if;
    if cell is not null and not (
      (item->>'type' in ('text','long_text','date','email','url','select') and jsonb_typeof(cell)='string')
      or (item->>'type'='number' and (jsonb_typeof(cell)='number' or cell='""'::jsonb))
      or (item->>'type'='checkbox' and jsonb_typeof(cell)='boolean')
    ) then raise exception 'Custom table value has the wrong type' using errcode='23514'; end if;
    if jsonb_typeof(cell)='string' and char_length(text_value)>2000 then raise exception 'Custom table value is too long' using errcode='23514'; end if;
    if item->>'type'='date' and coalesce(text_value,'')<>'' and text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date value' using errcode='23514'; end if;
    if item->>'type'='email' and coalesce(text_value,'')<>'' and text_value !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email value' using errcode='23514'; end if;
    if item->>'type'='url' and coalesce(text_value,'')<>'' and text_value !~* '^https://[^[:space:]]+$' then raise exception 'Invalid URL value' using errcode='23514'; end if;
    if item->>'type'='select' and coalesce(text_value,'')<>'' and not (item->'options' ? text_value) then raise exception 'Invalid select option' using errcode='23514'; end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(new.data) key where not key=any(allowed)) then raise exception 'Unknown custom table column' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.validate_club_custom_table_row() from public,anon,authenticated;

drop policy if exists "Club managers update custom tables" on public.club_custom_tables;
create policy "Club managers update custom tables" on public.club_custom_tables for update
using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
drop policy if exists "Club managers update custom rows" on public.club_custom_table_rows;
create policy "Club managers update custom rows" on public.club_custom_table_rows for update
using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)))
with check(updated_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club(t.club_id)));
grant update on public.club_custom_tables,public.club_custom_table_rows to authenticated;

drop trigger if exists club_custom_tables_touch_updated_at on public.club_custom_tables;
create trigger club_custom_tables_touch_updated_at before update on public.club_custom_tables for each row execute function public.touch_updated_at();
drop trigger if exists club_custom_table_rows_touch_updated_at on public.club_custom_table_rows;
create trigger club_custom_table_rows_touch_updated_at before update on public.club_custom_table_rows for each row execute function public.touch_updated_at();

commit;
