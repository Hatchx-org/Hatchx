import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import Pagination from "@/components/pagination";
import { parseAuditSearch, auditResources, type AuditSearch } from "@/lib/audit-query";

const field = "min-h-11 w-full rounded-lg border border-line bg-content-bg px-3 text-ink";
const pageSize = 30;

/** Audit is read-only. Raw before/after values preserve evidence for review. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<keyof AuditSearch, string | string[] | undefined>> }) {
  await requireAdmin();
  const rawSearch = await searchParams;
  const search: AuditSearch = Object.fromEntries(Object.entries(rawSearch).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const filters = parseAuditSearch(search);
  if ("error" in filters) return <div className="space-y-4 p-8"><p role="alert">{filters.error}</p><Link href="/admin/audit" className="underline">Reset filters</Link></div>;
  const db = await createServerClient();
  let actorId = filters.actor;
  if (actorId.includes("@")) {
    const profile = await db.from("profiles").select("id").eq("email", actorId.toLowerCase()).maybeSingle();
    if (profile.error) return <p role="alert" className="p-8">Unable to resolve the actor email. Please try again.</p>;
    if (!profile.data) return <div className="space-y-4 p-8"><p>No account matches that email.</p><Link href="/admin/audit" className="underline">Reset filters</Link></div>;
    actorId = profile.data.id;
  }
  const offset = (filters.page - 1) * pageSize;
  let rolesQuery = db.from("account_role_audit").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
  let changesQuery = db.from("management_audit").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (actorId) { rolesQuery = rolesQuery.eq("actor_id", actorId); changesQuery = changesQuery.eq("actor_id", actorId); }
  if (filters.from) { rolesQuery = rolesQuery.gte("created_at", filters.from); changesQuery = changesQuery.gte("created_at", filters.from); }
  if (filters.until) { rolesQuery = rolesQuery.lt("created_at", filters.until); changesQuery = changesQuery.lt("created_at", filters.until); }
  if (filters.resource) changesQuery = changesQuery.eq("resource", filters.resource);
  if (filters.operation) changesQuery = changesQuery.eq("operation", filters.operation);
  if (filters.q) changesQuery = changesQuery.textSearch("search_vector", filters.q, { config: "simple", type: "websearch" });
  const roles = filters.kind === "roles" ? await rolesQuery.range(offset, offset + pageSize - 1) : null;
  const changes = filters.kind === "changes" ? await changesQuery.range(offset, offset + pageSize - 1) : null;
  const result = roles ?? changes;
  const query = { kind: filters.kind, actor: filters.actor, from: search.from ?? "", to: search.to ?? "", resource: filters.resource, operation: filters.operation, q: filters.q };
  return <div className="mx-auto max-w-5xl space-y-5 px-5 py-8">
    <h1 className="text-3xl font-bold">Management audit</h1>
    <p>Read-only records, 30 per page. Dates use UTC. Club changes appear in each club’s management page.</p>
    <nav aria-label="Audit category" className="flex flex-wrap gap-3"><Link href="/admin/audit?kind=roles" aria-current={filters.kind === "roles" ? "page" : undefined} className="rounded-full border border-line px-4 py-2">Account roles</Link><Link href="/admin/audit?kind=changes" aria-current={filters.kind === "changes" ? "page" : undefined} className="rounded-full border border-line px-4 py-2">All platform changes</Link></nav>
    <form className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
      <input type="hidden" name="kind" value={filters.kind} />
      <label className="sm:col-span-2">Actor email or full account ID<input name="actor" maxLength={320} defaultValue={filters.actor} className={field} /></label>
      <label>From (UTC)<input name="from" type="date" defaultValue={search.from ?? ""} className={field} /></label><label>Through (UTC)<input name="to" type="date" defaultValue={search.to ?? ""} className={field} /></label>
      {filters.kind === "changes" && <><label className="sm:col-span-2">Search change details<input name="q" maxLength={120} defaultValue={filters.q} placeholder="Club, support subject, member, status…" className={field} /></label><label>Resource<select name="resource" defaultValue={filters.resource} className={field}><option value="">All resources</option>{auditResources.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Operation<select name="operation" defaultValue={filters.operation} className={field}><option value="">All operations</option>{["INSERT", "UPDATE", "DELETE"].map(value => <option key={value}>{value}</option>)}</select></label></>}
      <button className="min-h-11 rounded-full bg-navy px-5 text-cream">Apply filters</button><Link href={`/admin/audit?kind=${filters.kind}`} className="self-center text-center underline">Clear filters</Link>
    </form>
    {result?.error ? <p role="alert">Audit data is unavailable. Verify the role and custom permission migrations.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p>{result?.count ?? 0} matching records.</p><a href={`/admin/audit/export?${new URLSearchParams(query)}`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Export CSV</a></div>
      {!result?.data?.length && <p>No records on this page. <Link href={`/admin/audit?${new URLSearchParams(query)}`} className="underline">Return to first page</Link>.</p>}
      {roles?.data?.map(row => <article key={row.id} className="rounded-xl border border-line p-4 text-sm"><p className="font-semibold">{row.previous_role} → {row.new_role}</p><p className="break-all">Account {row.profile_id} · Actor {row.actor_id ?? "System"}</p><time dateTime={row.created_at}>{new Date(row.created_at).toISOString()}</time>{row.club_id && <p>Club: {row.club_id}</p>}</article>)}
      {changes?.data?.map(row => <details key={row.id} className="rounded-xl border border-line p-4 text-sm"><summary className="cursor-pointer break-words">{row.operation} · {row.resource} · {new Date(row.created_at).toISOString()}</summary><p className="mt-3 break-all">Actor: {row.actor_id ?? "System / SQL Editor"}</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-content-bg p-3">{JSON.stringify({ before: row.before_data, after: row.after_data }, null, 2)}</pre></details>)}
      <Pagination basePath="/admin/audit" page={filters.page} total={result?.count ?? 0} pageSize={pageSize} query={query} />
    </>}
  </div>;
}
