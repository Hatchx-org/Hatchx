-- Club fundraising and append-only finance ledger. Apply after club_governance.sql.
begin;

create table if not exists public.club_fundraisers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  school_year text not null check(school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  title text not null check(char_length(btrim(title)) between 3 and 120),
  purpose text not null check(char_length(btrim(purpose)) between 10 and 2000),
  target_cents integer not null check(target_cents between 1 and 999999999),
  planned_start date not null,
  planned_end date not null check(planned_end >= planned_start),
  status text not null default 'pending_treasurer' check(status in ('pending_treasurer','approved','rejected','final_statement_due','closed')),
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text,
  final_statement_due_at date generated always as(planned_end + 30) stored,
  final_statement text, proceeds_cents integer check(proceeds_cents >= 0), expenses_cents integer check(expenses_cents >= 0),
  closed_by uuid references public.profiles(id), closed_at timestamptz
);

create table if not exists public.club_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  school_year text not null check(school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  entry_type text not null check(entry_type in ('income','expense')),
  amount_cents integer not null check(amount_cents between 1 and 999999999),
  category text not null check(char_length(btrim(category)) between 2 and 80),
  description text not null check(char_length(btrim(description)) between 3 and 1000),
  occurred_on date not null,
  receipt_reference text check(receipt_reference is null or char_length(receipt_reference) <= 500),
  fundraiser_id uuid references public.club_fundraisers(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists club_fundraisers_club_status_idx on public.club_fundraisers(club_id,status,planned_start);
create index if not exists club_finance_transactions_club_date_idx on public.club_finance_transactions(club_id,occurred_on desc,created_at desc);

create or replace function public.can_approve_club_finance(p_club_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_govern_club(p_club_id) or exists(select 1 from public.club_officers o where o.club_id=p_club_id and o.profile_id=auth.uid() and lower(o.title) like '%treasurer%' and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date));
$$;

alter table public.club_fundraisers enable row level security;
alter table public.club_finance_transactions enable row level security;
drop policy if exists "Board reads club fundraisers" on public.club_fundraisers;
drop policy if exists "Board submits club fundraisers" on public.club_fundraisers;
drop policy if exists "Board reads club ledger" on public.club_finance_transactions;
drop policy if exists "Board records club ledger" on public.club_finance_transactions;
drop policy if exists "Staff records club ledger" on public.club_finance_transactions;
create policy "Board reads club fundraisers" on public.club_fundraisers for select using(public.can_manage_club(club_id));
create policy "Board submits club fundraisers" on public.club_fundraisers for insert with check(public.can_manage_club(club_id) and submitted_by=auth.uid() and status='pending_treasurer');
create policy "Board reads club ledger" on public.club_finance_transactions for select using(public.can_manage_club(club_id));
create policy "Staff records club ledger" on public.club_finance_transactions for insert with check(public.is_staff_or_admin() and created_by=auth.uid());

create or replace function public.review_club_fundraiser(p_fundraiser_id uuid,p_approve boolean,p_note text) returns boolean language plpgsql security definer set search_path=public as $$ declare target public.club_fundraisers; begin select * into target from public.club_fundraisers where id=p_fundraiser_id for update; if target.id is null or not public.can_approve_club_finance(target.club_id) or target.status<>'pending_treasurer' then return false; end if; if char_length(btrim(coalesce(p_note,'')))>1000 then return false; end if; update public.club_fundraisers set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=p_fundraiser_id; return true; end $$;
create or replace function public.close_club_fundraiser(p_fundraiser_id uuid,p_statement text,p_proceeds_cents integer,p_expenses_cents integer) returns boolean language plpgsql security definer set search_path=public as $$ declare target public.club_fundraisers; begin select * into target from public.club_fundraisers where id=p_fundraiser_id for update; if target.id is null or not public.can_manage_club(target.club_id) or target.status not in ('approved','final_statement_due') or char_length(btrim(coalesce(p_statement,''))) not between 10 and 4000 or p_proceeds_cents<0 or p_expenses_cents<0 then return false; end if; update public.club_fundraisers set status='closed',final_statement=btrim(p_statement),proceeds_cents=p_proceeds_cents,expenses_cents=p_expenses_cents,closed_by=auth.uid(),closed_at=now() where id=p_fundraiser_id; return true; end $$;
revoke all on function public.can_approve_club_finance(uuid),public.review_club_fundraiser(uuid,boolean,text),public.close_club_fundraiser(uuid,text,integer,integer) from public;
grant execute on function public.can_approve_club_finance(uuid),public.review_club_fundraiser(uuid,boolean,text),public.close_club_fundraiser(uuid,text,integer,integer) to authenticated;

do $$ begin
  if to_regprocedure('public.log_club_change()') is not null then
    drop trigger if exists audit_club_change on public.club_fundraisers;
    create trigger audit_club_change after insert or update or delete on public.club_fundraisers for each row execute function public.log_club_change();
    drop trigger if exists audit_club_change on public.club_finance_transactions;
    create trigger audit_club_change after insert or update or delete on public.club_finance_transactions for each row execute function public.log_club_change();
  end if;
  if to_regprocedure('public.audit_management_change()') is not null then
    drop trigger if exists club_fundraisers_global_audit on public.club_fundraisers;
    create trigger club_fundraisers_global_audit after insert or update or delete on public.club_fundraisers for each row execute function public.audit_management_change();
    drop trigger if exists club_finance_transactions_global_audit on public.club_finance_transactions;
    create trigger club_finance_transactions_global_audit after insert or update or delete on public.club_finance_transactions for each row execute function public.audit_management_change();
  end if;
end $$;
commit;
