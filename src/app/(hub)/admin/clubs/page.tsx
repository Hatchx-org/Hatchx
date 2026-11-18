import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import Pagination from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import ApplicationActions from "./application-actions";
import ClubManagementClient, { type AdminClubRow } from "./club-management-client";

const PAGE_SIZE = 20;
const applicationStatuses = ["pending", "approved", "rejected"] as const;
const clubStatuses = ["all", "published", "draft", "archived"] as const;
export const metadata: Metadata = { title: "Manage Clubs — Admin" };
type Search = { view?: string; q?: string; status?: string; category?: string; sort?: string; page?: string; applicationStatus?: string };
const pageNumber = (value?: string) => Math.max(1, Number.parseInt(value ?? "1", 10) || 1);

export default async function AdminClubsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const search = await searchParams;
  const view = search.view === "applications" ? "applications" : "clubs";
  return <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
    <PageHeader title="Club Management" subtitle="Create, publish, archive, and maintain every Hatchx Club from one organized dashboard." />
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line"><nav aria-label="Club administration views" className="flex gap-1"><Link href="/admin/clubs" aria-current={view === "clubs" ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-bold ${view === "clubs" ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink"}`}>All Clubs</Link><Link href="/admin/clubs?view=applications" aria-current={view === "applications" ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-bold ${view === "applications" ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink"}`}>Applications</Link></nav><Link href="/admin/clubs/tags" className="pb-3 text-sm font-semibold text-navy">Manage Club tags →</Link></div>
    {view === "clubs" ? <ClubsDashboard search={search} /> : <ApplicationsDashboard search={search} />}
  </div>;
}

async function ClubsDashboard({ search }: { search: Search }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const db = await createServerClient();
  const q = String(search.q ?? "").replace(/[%_]/g, "").trim().slice(0, 80);
  const status = clubStatuses.includes(search.status as (typeof clubStatuses)[number]) ? search.status! : "all";
  const category = String(search.category ?? "all").slice(0, 30);
  const sort = ["name", "newest", "oldest", "status"].includes(search.sort ?? "") ? search.sort! : "name";
  const page = pageNumber(search.page);
  const from = (page - 1) * PAGE_SIZE;
  const { data: categoryRows } = await db.from("clubs").select("category,interest_tags");
  const categories = [...new Set((categoryRows ?? []).map((row) => row.category || row.interest_tags?.[0]).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  let query = db.from("clubs").select("id,slug,name,short_description,category,interest_tags,status,recruiting_status,join_policy,contact_email,active_start_date,active_end_date,created_at", { count: "exact" });
  if (q) query = query.ilike("name", `%${q}%`);
  if (status !== "all") query = query.eq("status", status as "draft" | "published" | "archived");
  if (category !== "all") query = query.contains("interest_tags", [category]);
  if (sort === "newest") query = query.order("created_at", { ascending: false });
  else if (sort === "oldest") query = query.order("created_at");
  else if (sort === "status") query = query.order("status").order("name");
  else query = query.order("name");
  const { data: clubs, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) return <p role="alert" className="mt-6 rounded-control border border-orange/30 bg-orange/10 p-4 text-sm">Clubs could not be loaded. Apply the latest Supabase schema and refresh.</p>;
  const ids = (clubs ?? []).map((club) => club.id);
  const [memberships, meetings] = ids.length ? await Promise.all([db.rpc("get_admin_club_member_counts", { p_club_ids: ids }), db.from("club_meetings").select("club_id,day_of_week,start_time,end_time,location,created_at").in("club_id", ids).order("created_at")]) : [{ data: [] }, { data: [] }];
  const memberCounts = new Map((memberships.data ?? []).map((membership) => [membership.club_id, Number(membership.member_count)]));
  const primaryMeetings = new Map<string, NonNullable<typeof meetings.data>[number]>();
  for (const meeting of meetings.data ?? []) if (!primaryMeetings.has(meeting.club_id)) primaryMeetings.set(meeting.club_id, meeting);
  const rows: AdminClubRow[] = (clubs ?? []).map((club) => ({ id: club.id, slug: club.slug, name: club.name, short_description: club.short_description, category: club.category || club.interest_tags?.[0] || "Other", member_count: memberCounts.get(club.id) ?? 0, status: club.status, recruiting_status: club.recruiting_status, join_policy: club.join_policy, contact_email: club.contact_email, active_start_date: club.active_start_date, active_end_date: club.active_end_date, meeting: primaryMeetings.get(club.id) ?? null }));
  const queryValues = { ...(q && { q }), ...(status !== "all" && { status }), ...(category !== "all" && { category }), ...(sort !== "name" && { sort }) };
  return <>
    <section className="mt-6 rounded-card border border-line bg-card p-4 shadow-sm" aria-label="Filter Clubs"><form className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_170px_auto]" method="get"><input type="search" name="q" defaultValue={q} placeholder="Search by Club name…" aria-label="Search Clubs" className="h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-powder" /><select name="status" defaultValue={status} aria-label="Filter by status" className="h-11 rounded-control border border-line bg-content-bg px-3 text-sm font-semibold text-ink"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select><select name="category" defaultValue={category} aria-label="Filter by category" className="h-11 rounded-control border border-line bg-content-bg px-3 text-sm font-semibold text-ink"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select name="sort" defaultValue={sort} aria-label="Sort Clubs" className="h-11 rounded-control border border-line bg-content-bg px-3 text-sm font-semibold text-ink"><option value="name">Name A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="status">Status</option></select><button className="h-11 rounded-full border border-navy px-5 text-sm font-bold text-navy hover:bg-navy hover:text-cream">Apply</button></form><div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted"><span>{count ?? 0} Club{count === 1 ? "" : "s"} found</span>{(q || status !== "all" || category !== "all" || sort !== "name") && <Link href="/admin/clubs" className="font-semibold text-navy">Clear filters</Link>}</div></section>
    <div className="mt-5"><h2 className="text-xl font-bold text-ink">All Clubs</h2><p className="mt-1 text-sm text-muted">Quick edits preserve memberships, attendance, and related records.</p></div>
    <ClubManagementClient clubs={rows} />
    {!rows.length && <div className="mt-5 rounded-card border border-dashed border-line bg-card p-10 text-center"><p className="font-bold text-ink">No Clubs match these filters</p><p className="mt-1 text-sm text-muted">Clear the filters or create a new Club.</p></div>}
    <Pagination basePath="/admin/clubs" page={page} total={count ?? 0} pageSize={PAGE_SIZE} query={queryValues} />
  </>;
}

async function ApplicationsDashboard({ search }: { search: Search }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const db = await createServerClient();
  const status = applicationStatuses.includes(search.applicationStatus as (typeof applicationStatuses)[number]) ? search.applicationStatus! : "pending";
  const page = pageNumber(search.page);
  const from = (page - 1) * PAGE_SIZE;
  const { data: rows, count } = await db.from("club_applications").select("id,club_name,category,description,meeting_days,contact_email,status,created_at", { count: "exact" }).eq("status", status as (typeof applicationStatuses)[number]).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  return <><nav className="mt-6 flex gap-2" aria-label="Applications by status">{applicationStatuses.map((item) => <Link key={item} href={`/admin/clubs?view=applications&applicationStatus=${item}`} aria-current={status === item ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${status === item ? "bg-navy text-cream" : "border border-line bg-card text-muted"}`}>{item}</Link>)}</nav><section className="mt-5 overflow-hidden rounded-card border border-line bg-card shadow-sm"><div className="divide-y divide-line">{rows?.length ? rows.map((row) => <article key={row.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="font-bold text-ink">{row.club_name}</h2><p className="mt-1 text-xs text-muted">{row.category}{row.meeting_days ? ` · ${row.meeting_days}` : ""} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(row.created_at))}</p></div>{status === "pending" && <ApplicationActions id={row.id} />}</div><p className="mt-3 text-sm leading-6 text-muted">{row.description}</p>{row.contact_email && <p className="mt-2 text-xs text-muted">Applicant: {row.contact_email}</p>}</article>) : <div className="p-10 text-center text-sm text-muted">No {status} applications.</div>}</div></section><Pagination basePath="/admin/clubs" page={page} total={count ?? 0} pageSize={PAGE_SIZE} query={{ view: "applications", applicationStatus: status }} /></>;
}

function SetupNotice() { return <div className="mt-6 rounded-control border border-orange/30 bg-orange/10 p-4 text-sm"><strong>Supabase is not configured.</strong> Connect the project and apply the current schema to manage Clubs.</div>; }
