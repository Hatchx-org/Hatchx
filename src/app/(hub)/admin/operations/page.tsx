import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { pageVitals, vitalTargets } from "@/lib/web-vitals";
import { resolveSystemError } from "./actions";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
async function requestTime() { return Date.now(); }

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ days?: string; device?: string }> }) {
  await requireAdmin();
  if (!isSupabaseConfigured()) return <main className="p-8"><p role="alert">Operations data is unavailable until Supabase is configured.</p></main>;
  const db = await createServerClient();
  const filters = await searchParams;
  const rangeDays = Math.min(365, Math.max(1, Number(filters.days) || 30));
  const device = ["mobile", "tablet", "desktop"].includes(filters.device ?? "") ? filters.device! : "all";
  const now = await requestTime();
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const dayAgo = new Date(now - 86400000).toISOString();
  const monthAgo = new Date(now - rangeDays * 86400000).toISOString();
  const staleBefore = new Date(now - 120 * 86400000).toISOString();

  const [stale, applications, announcements, support, errors, profiles, memberships, searches, zeroSearches] = await Promise.all([
    db.from("clubs").select("id,name,slug,updated_at", { count: "exact" }).eq("status", "published").lt("updated_at", staleBefore).order("updated_at").limit(8),
    db.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("school_announcement_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("support_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    db.from("system_errors").select("id,source,message,created_at", { count: "exact" }).is("resolved_at", null).order("created_at", { ascending: false }).limit(8),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("club_memberships").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("search_analytics").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    db.from("search_analytics").select("normalized_query,created_at").eq("result_count", 0).gte("created_at", monthAgo).order("created_at", { ascending: false }).limit(1000),
  ]);
  const analytics = await db.from("analytics_events").select("event_name,route,user_id,session_id,metric_value,metadata,created_at").gte("created_at", monthAgo).order("created_at", { ascending: false }).limit(10000);
  const analyticsRows = (analytics.data ?? []).filter(row => device === "all" || (row.metadata as Record<string,unknown>)?.device === device);
  const slowPages = pageVitals(analyticsRows).slice(0, 10);
  const dailyActive = new Set(analyticsRows.filter(row => row.created_at >= dayAgo).map(row => row.user_id ?? row.session_id).filter(Boolean)).size;
  const searchToClub = analyticsRows.filter(row => row.event_name === "search_result_click").length;
  const joinStarted = analyticsRows.filter(row => row.event_name === "club_join_started").length;
  const joinCompleted = analyticsRows.filter(row => row.event_name === "club_join_completed").length;
  const p75 = (name: string) => { const values = analyticsRows.filter(row => row.event_name === name && row.metric_value != null).map(row => row.metric_value as number).sort((a, b) => a - b); return values.length ? values[Math.floor((values.length - 1) * .75)] : null; };

  const zeroCounts = new Map<string, number>();
  for (const row of zeroSearches.data ?? []) zeroCounts.set(row.normalized_query, (zeroCounts.get(row.normalized_query) ?? 0) + 1);
  const topZero = [...zeroCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  const migrationUnavailable = Boolean(errors.error || searches.error || zeroSearches.error);
  const stats = [
    ["Stale club profiles", stale.error ? null : stale.count, "No update in 120+ days"],
    ["Approval queues", [applications.count, announcements.count, support.count].some(value => value == null) ? null : (applications.count ?? 0) + (announcements.count ?? 0) + (support.count ?? 0), "Clubs, announcements, support"],
    ["Open errors", errors.error ? null : errors.count, "Unresolved operational records"],
    ["Searches · 7 days", searches.error ? null : searches.count, "Executed site searches"],
    ["User accounts", profiles.count, "Current profiles"],
    ["Active memberships", memberships.count, "Current club participation"],
  ] as const;

  return <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
    <PageHeader title="Admin Operations" subtitle="Monitor stale content, work queues, errors, usage, and searches that returned no results." />
    <form className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-card p-4"><label className="text-xs font-semibold text-muted">Date range<select name="days" defaultValue={String(rangeDays)} className="mt-1 block h-10 rounded-control border border-line bg-content-bg px-3 text-ink"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label><label className="text-xs font-semibold text-muted">Device<select name="device" defaultValue={device} className="mt-1 block h-10 rounded-control border border-line bg-content-bg px-3 text-ink"><option value="all">All devices</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></label><button className="h-10 rounded-full bg-navy px-5 text-sm font-bold text-cream">Apply</button><a href={`/admin/operations/export?days=${rangeDays}`} className="ml-auto inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink">Export CSV</a></form>
    {migrationUnavailable && <div role="alert" className="rounded-card border border-orange-400/40 bg-card p-4 text-sm text-ink">Operational intelligence is not fully available. Run <code>supabase/operational_intelligence.sql</code> in Supabase, then reload.</div>}
    <section aria-label="Operations summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map(([label, value, note]) => <article key={label} className="rounded-card border border-line bg-card p-5 shadow-sm"><p className="text-sm font-semibold text-muted">{label}</p><p className="mt-2 text-3xl font-bold text-ink">{value ?? "—"}</p><p className="mt-1 text-xs text-muted">{value == null ? "Data unavailable" : note}</p></article>)}
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-card border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-muted">Search intelligence</p><h2 className="mt-1 text-xl font-bold text-ink">Top zero-result searches</h2></div><span className="rounded-full bg-content-bg px-3 py-1 text-xs text-muted">30 days</span></div>
        {zeroSearches.error ? <p className="mt-5 text-sm text-muted">Search analytics needs the operational migration.</p> : topZero.length ? <ol className="mt-4 divide-y divide-line">{topZero.map(([query, count], index) => <li key={query} className="flex items-center gap-3 py-3"><span className="w-6 text-sm font-bold text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate font-semibold text-ink">{query}</span><span className="rounded-full bg-content-bg px-2.5 py-1 text-xs text-muted">{count} searches</span></li>)}</ol> : <p className="mt-5 text-sm text-muted">No zero-result searches recorded in the last 30 days.</p>}
      </section>

      <section className="rounded-card border border-line bg-card p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Content health</p><h2 className="mt-1 text-xl font-bold text-ink">Stale club profiles</h2>
        {stale.error ? <p className="mt-5 text-sm text-muted">Club freshness data is unavailable.</p> : stale.data?.length ? <ul className="mt-4 divide-y divide-line">{stale.data.map(club => <li key={club.id} className="flex items-center justify-between gap-4 py-3"><div><Link href={`/clubs/${club.slug}`} className="font-semibold text-ink underline-offset-4 hover:underline">{club.name}</Link><p className="text-xs text-muted">Updated {date.format(new Date(club.updated_at))}</p></div><Link href={`/clubs/manage/${club.id}`} className="text-sm font-semibold text-navy">Review →</Link></li>)}</ul> : <p className="mt-5 text-sm text-muted">All published club profiles have been updated within 120 days.</p>}
      </section>

      <section className="rounded-card border border-line bg-card p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Queues</p><h2 className="mt-1 text-xl font-bold text-ink">Items needing attention</h2>
        <div className="mt-4 space-y-3">{[["Club applications", applications.count, "/admin/clubs"], ["Announcement approvals", announcements.count, "/admin/review"], ["Support conversations", support.count, "/admin/support"]].map(([label, count, href]) => <Link key={String(label)} href={String(href)} className="flex items-center justify-between rounded-xl bg-content-bg px-4 py-3"><span className="font-semibold text-ink">{label}</span><span className="text-sm text-muted">{count ?? "—"} →</span></Link>)}</div>
      </section>

      <section className="rounded-card border border-line bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-muted">Reliability</p><h2 className="mt-1 text-xl font-bold text-ink">Recent open errors</h2></div><Link href="/admin/audit?kind=changes" className="text-sm font-semibold text-navy">Open audit →</Link></div>
        {errors.error ? <p className="mt-5 text-sm text-muted">Error tracking needs the operational migration.</p> : errors.data?.length ? <ul className="mt-4 divide-y divide-line">{errors.data.map(error => <li key={error.id} className="py-3"><p className="font-semibold text-ink">{error.source}</p><p className="line-clamp-2 text-sm text-muted">{error.message}</p><div className="mt-1 flex items-center justify-between gap-3"><time className="text-xs text-muted" dateTime={error.created_at}>{new Date(error.created_at).toLocaleString("en-US")}</time><form action={resolveSystemError}><input type="hidden" name="id" value={error.id}/><button className="text-xs font-bold text-navy">Mark resolved</button></form></div></li>)}</ul> : <p className="mt-5 text-sm text-muted">No unresolved operational errors.</p>}
      </section>
    </div>
    <section className="rounded-card border border-line bg-card p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-muted">Product analytics</p><h2 className="mt-1 text-xl font-bold text-ink">DAU, discovery, join funnel &amp; Core Web Vitals</h2></div><span className="text-xs text-muted">{rangeDays} days · {device} devices · DAU uses last 24 hours</span></div>{analytics.error ? <p className="mt-5 text-sm text-muted">Run <code>supabase/school_operations.sql</code> to begin collecting product analytics.</p> : <><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Active users / sessions" value={String(dailyActive)} /><Metric label="Search → Club" value={String(searchToClub)} /><Metric label="Join funnel" value={`${joinCompleted}/${joinStarted}`} note={joinStarted ? `${Math.round(joinCompleted / joinStarted * 100)}% completion` : "No starts yet"} /><Metric label="LCP p75" value={p75("LCP") == null ? "—" : `${Math.round(p75("LCP")!)} ms`} /><Metric label="INP p75" value={p75("INP") == null ? "—" : `${Math.round(p75("INP")!)} ms`} /><Metric label="CLS p75" value={p75("CLS") == null ? "—" : p75("CLS")!.toFixed(3)} /></div><Trend rows={analyticsRows}/></>}</section>
    <section className="rounded-card border border-line bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold text-ink">Slowest pages on real devices</h2>
      <p className="mt-1 text-xs text-muted">At least five measurements per page. Targets: LCP ≤ {vitalTargets.LCP} ms, INP ≤ {vitalTargets.INP} ms, CLS ≤ {vitalTargets.CLS}.</p>
      {slowPages.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-line text-muted"><th className="py-2">Page</th><th>Samples</th><th>LCP p75</th><th>INP p75</th><th>CLS p75</th></tr></thead><tbody>{slowPages.map((row) => <tr key={row.route} className="border-b border-line/50"><td className="max-w-56 truncate py-2 font-semibold text-ink">{row.route}</td><td>{row.samples}</td><td className={row.LCP != null && row.LCP > vitalTargets.LCP ? "font-bold text-orange" : "text-ink"}>{row.LCP == null ? "—" : `${Math.round(row.LCP)} ms`}</td><td className={row.INP != null && row.INP > vitalTargets.INP ? "font-bold text-orange" : "text-ink"}>{row.INP == null ? "—" : `${Math.round(row.INP)} ms`}</td><td className={row.CLS != null && row.CLS > vitalTargets.CLS ? "font-bold text-orange" : "text-ink"}>{row.CLS == null ? "—" : row.CLS.toFixed(3)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted">Not enough real-device samples yet.</p>}
    </section>
  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <article className="rounded-control bg-content-bg p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{value}</p>{note && <p className="mt-1 text-xs text-muted">{note}</p>}</article>; }
function Trend({rows}:{rows:{created_at:string}[]}){const counts=new Map<string,number>();for(const row of rows){const key=row.created_at.slice(0,10);counts.set(key,(counts.get(key)??0)+1)}const values=[...counts].sort().slice(-30);const max=Math.max(1,...values.map(x=>x[1]));return <div className="mt-6"><p className="text-xs font-semibold text-muted">Daily event trend</p><div className="mt-3 flex h-28 items-end gap-1" aria-label="Daily analytics trend">{values.map(([day,count])=><div key={day} title={`${day}: ${count}`} className="min-w-1 flex-1 rounded-t bg-navy" style={{height:`${Math.max(4,count/max*100)}%`}}/>)}</div></div>}
