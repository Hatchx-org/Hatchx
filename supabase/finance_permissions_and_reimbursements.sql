-- Staff-only treasury writes plus private, multi-file reimbursement tickets.
-- Run after club_finance.sql, school_operations.sql, and workflow_completion.sql.
begin;

alter table public.club_finance_transactions
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz;

drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff updates club ledger" on public.club_finance_transactions;
create policy "Staff records club ledger" on public.club_finance_transactions for insert
with check(public.is_staff_or_admin() and created_by=auth.uid());
create policy "Staff updates club ledger" on public.club_finance_transactions for update
using(public.is_staff_or_admin())
with check(public.is_staff_or_admin() and updated_by=auth.uid());
grant update on public.club_finance_transactions to authenticated;

drop policy if exists "Board submits club fundraisers" on public.club_fundraisers;
drop policy if exists "Staff manages club fundraisers" on public.club_fundraisers;
create policy "Staff manages club fundraisers" on public.club_fundraisers for all
using(public.is_staff_or_admin())
with check(public.is_staff_or_admin());

create or replace function public.can_approve_club_finance(p_club_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_staff_or_admin();
$$;
create or replace function public.review_club_fundraiser(p_fundraiser_id uuid,p_approve boolean,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare target public.club_fundraisers;
begin
  select * into target from public.club_fundraisers where id=p_fundraiser_id for update;
  if target.id is null or not public.is_staff_or_admin() or target.status<>'pending_treasurer' then return false; end if;
  if char_length(btrim(coalesce(p_note,'')))>1000 then return false; end if;
  update public.club_fundraisers set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_fundraiser_id;
  return true;
end $$;
create or replace function public.close_club_fundraiser(p_fundraiser_id uuid,p_statement text,p_proceeds_cents integer,p_expenses_cents integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare target public.club_fundraisers;
begin
  select * into target from public.club_fundraisers where id=p_fundraiser_id for update;
  if target.id is null or not public.is_staff_or_admin() or target.status not in ('approved','final_statement_due')
    or char_length(btrim(coalesce(p_statement,''))) not between 10 and 4000
    or p_proceeds_cents<0 or p_expenses_cents<0 then return false; end if;
  update public.club_fundraisers set status='closed',final_statement=btrim(p_statement),
    proceeds_cents=p_proceeds_cents,expenses_cents=p_expenses_cents,closed_by=auth.uid(),closed_at=now()
    where id=p_fundraiser_id;
  return true;
end $$;

drop policy if exists "Governors manage budgets" on public.club_budgets;
drop policy if exists "Staff manages budgets" on public.club_budgets;
create policy "Staff manages budgets" on public.club_budgets for all
using(public.is_staff_or_admin()) with check(public.is_staff_or_admin());

drop policy if exists "Governors review reimbursements" on public.club_reimbursements;
drop policy if exists "Staff reviews reimbursements" on public.club_reimbursements;
drop policy if exists "Submitters remove pending reimbursements" on public.club_reimbursements;
create policy "Staff reviews reimbursements" on public.club_reimbursements for update
using(public.is_staff_or_admin()) with check(public.is_staff_or_admin());
create policy "Submitters remove pending reimbursements" on public.club_reimbursements for delete
using(submitted_by=auth.uid() and status='pending');

create table if not exists public.club_reimbursement_attachments(
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.club_reimbursements(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check(char_length(file_name) between 1 and 180),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  file_size integer not null check(file_size between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists reimbursement_attachments_ticket_idx
  on public.club_reimbursement_attachments(reimbursement_id,created_at);
alter table public.club_reimbursement_attachments enable row level security;
drop policy if exists "Club managers read reimbursement attachments" on public.club_reimbursement_attachments;
drop policy if exists "Submitters add reimbursement attachments" on public.club_reimbursement_attachments;
create policy "Club managers read reimbursement attachments" on public.club_reimbursement_attachments for select
using(exists(select 1 from public.club_reimbursements r where r.id=reimbursement_id and public.can_manage_club(r.club_id)));
create policy "Submitters add reimbursement attachments" on public.club_reimbursement_attachments for insert
with check(uploaded_by=auth.uid() and exists(select 1 from public.club_reimbursements r
  where r.id=reimbursement_id and r.submitted_by=auth.uid() and r.status='pending'));
grant select,insert on public.club_reimbursement_attachments to authenticated;

drop policy if exists "Club managers upload receipts" on storage.objects;
drop policy if exists "Club governors read receipts" on storage.objects;
drop policy if exists "Club managers read receipts" on storage.objects;
drop policy if exists "Receipt owners remove failed uploads" on storage.objects;
create policy "Club managers upload receipts" on storage.objects for insert to authenticated
with check(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Club managers read receipts" on storage.objects for select to authenticated
using(bucket_id='club-receipts' and public.can_manage_club(((storage.foldername(name))[1])::uuid));
create policy "Receipt owners remove failed uploads" on storage.objects for delete to authenticated
using(bucket_id='club-receipts' and owner_id=auth.uid()::text);

do $$ begin
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists club_reimbursement_attachments_global_audit on public.club_reimbursement_attachments;
    create trigger club_reimbursement_attachments_global_audit after insert or update or delete
      on public.club_reimbursement_attachments for each row execute function public.audit_management_change();
  end if;
end $$;

commit;
