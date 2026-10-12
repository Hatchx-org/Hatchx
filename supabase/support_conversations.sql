-- Keep support request ordering current whenever either participant replies.
begin;
create or replace function public.touch_support_request_from_reply() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.support_requests set updated_at=now() where id=new.request_id;
  return new;
end $$;
drop trigger if exists support_reply_touch_request on public.support_request_updates;
create trigger support_reply_touch_request after insert on public.support_request_updates
for each row execute function public.touch_support_request_from_reply();
commit;
