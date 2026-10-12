-- Public FAQs curated by administrators from resolved support conversations.
begin;

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  source_request_id uuid unique references public.support_requests(id) on delete set null,
  question text not null check (char_length(question) between 5 and 180),
  answer text not null check (char_length(answer) between 10 and 4000),
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_faqs_public_order_idx on public.support_faqs (published, sort_order, updated_at desc);
alter table public.support_faqs enable row level security;
drop policy if exists "Anyone reads published support FAQs" on public.support_faqs;
create policy "Anyone reads published support FAQs" on public.support_faqs for select using (published or public.is_staff_or_admin());
drop policy if exists "Admins manage support FAQs" on public.support_faqs;
create policy "Admins manage support FAQs" on public.support_faqs for all using (public.is_admin()) with check (public.is_admin());
grant select on public.support_faqs to anon, authenticated;
grant insert, update, delete on public.support_faqs to authenticated;

commit;
