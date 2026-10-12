-- Restrict manually recorded money movements to Staff and Admin accounts.
-- Club boards and treasurers retain read access and use the fundraiser and
-- reimbursement workflows instead of writing directly to the official ledger.
begin;

drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;

create policy "Staff records club ledger"
on public.club_finance_transactions
for insert
with check (public.is_staff_or_admin() and created_by = auth.uid());

commit;
