import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ActionFeedbackForm from "@/components/action-feedback-form";
import Pagination from "@/components/pagination";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { ClubCustomColumn, ClubCustomTableDataRow } from "@/lib/supabase/types";
import { deleteCustomTableRow, duplicateCustomTable, importCustomTableCsv, revokeCustomFormLink, updateCustomTableRow } from "../actions";
import TableBuilder from "../table-builder";
import ResponseForm from "./response-form";
import ShareLinkForm from "./share-link-form";

const input = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/10";
const PAGE_SIZE = 25;
type View = "form" | "responses" | "settings";

function CellInput({ column, value }: { column: ClubCustomColumn; value?: string | number | boolean }) {
  const label = <>{column.label}{column.required ? " *" : ""}</>;
  if (column.type === "checkbox") return <label className="flex h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" name={column.key} defaultChecked={value === true} /> {label}</label>;
  if (column.type === "long_text") return <label className="text-sm font-semibold">{label}<textarea name={column.key} required={column.required} maxLength={2000} rows={3} defaultValue={String(value ?? "")} className={`${input} mt-1 h-auto py-2`} /></label>;
  if (column.type === "select") return <label className="text-sm font-semibold">{label}<select name={column.key} required={column.required} defaultValue={String(value ?? "")} className={`${input} mt-1`}><option value="">Choose…</option>{column.options?.map(option => <option key={option}>{option}</option>)}</select></label>;
  const type = column.type === "number" ? "number" : column.type === "date" ? "date" : column.type === "email" ? "email" : column.type === "url" ? "url" : "text";
  return <label className="text-sm font-semibold">{label}<input name={column.key} type={type} required={column.required} defaultValue={typeof value === "boolean" ? "" : value ?? ""} maxLength={["text", "email", "url"].includes(column.type) ? 2000 : undefined} step={column.type === "number" ? "any" : undefined} pattern={column.type === "url" ? "https://.*" : undefined} className={`${input} mt-1`} /></label>;
}

function display(column: ClubCustomColumn, value: string | number | boolean | undefined) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "" || value == null) return "—";
  if (column.type === "url" && typeof value === "string" && value.startsWith("https://")) return <a href={value} target="_blank" rel="noreferrer" className="font-semibold text-navy underline">Open link</a>;
  if (column.type === "email" && typeof value === "string") return <a href={`mailto:${value}`} className="font-semibold text-navy underline">{value}</a>;
  return String(value);
}

function compare(a: ClubCustomTableDataRow, b: ClubCustomTableDataRow, key: string, direction: string) {
  const av = key === "created_at" ? a.created_at : a.data[key];
  const bv = key === "created_at" ? b.created_at : b.data[key];
  const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function ViewTab({ href, active, children, count }: { href: string; active: boolean; children: React.ReactNode; count?: number }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`relative flex h-12 items-center gap-2 px-4 text-sm font-bold transition ${active ? "text-navy" : "text-muted hover:text-ink"}`}>{children}{count !== undefined ? <span className="rounded-full bg-content-bg px-2 py-0.5 text-xs">{count}</span> : null}{active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-navy" /> : null}</Link>;
}

export default async function CustomTablePage({ params, searchParams }: {
  params: Promise<{ id: string; tableId: string }>;
  searchParams: Promise<{ view?: string; q?: string; sort?: string; direction?: string; page?: string }>;
}) {
  const { id, tableId } = await params;
  const search = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/clubs/manage/${id}/tables/${tableId}`)}`);

  const db = await createServerClient();
  const access = await db.rpc("can_manage_club_forms", { p_club_id: id });
  if (!access.data) redirect("/clubs/manage");
  const [club, table, rows, links] = await Promise.all([
    db.from("clubs").select("id,name").eq("id", id).maybeSingle(),
    db.from("club_custom_tables").select("*").eq("id", tableId).eq("club_id", id).maybeSingle(),
    db.from("club_custom_table_rows").select("*").eq("table_id", tableId).order("created_at", { ascending: false }).limit(1000),
    db.from("club_custom_form_links").select("id,expires_at,active,created_at").eq("table_id",tableId).order("created_at",{ascending:false}),
  ]);
  if (!club.data || !table.data) notFound();

  const columns = table.data.columns;
  const view: View = search.view === "responses" || search.view === "settings" ? search.view : "form";
  const query = (search.q ?? "").normalize("NFKC").trim().slice(0, 80).toLocaleLowerCase();
  const sort = search.sort === "created_at" || columns.some(column => column.key === search.sort) ? search.sort ?? "created_at" : "created_at";
  const direction = search.direction === "asc" ? "asc" : "desc";
  const filtered = (rows.data ?? []).filter(row => !query || Object.values(row.data).some(value => String(value).toLocaleLowerCase().includes(query))).sort((a, b) => compare(a, b, sort, direction));
  const page = Math.max(1, Number.parseInt(search.page ?? "1", 10) || 1);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const responseCount = rows.data?.length ?? 0;

  return <div className="min-h-screen bg-content-bg/50 pb-14 text-ink">
    <header className="border-b border-line bg-card">
      <div className="mx-auto max-w-7xl px-5 pt-6">
        <Link href={`/clubs/manage/${id}/tables`} className="text-sm font-semibold text-powder">← {club.data.name} forms</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0"><h1 className="truncate text-3xl font-bold sm:text-4xl">{table.data.name}</h1><p className="mt-1 text-sm text-muted">{table.data.description || "Club response form"}</p></div>
          {view === "responses" ? <a href={`/clubs/manage/${id}/tables/${tableId}/export`} className="rounded-full border border-line bg-card px-5 py-2.5 text-sm font-bold hover:bg-content-bg">Export CSV</a> : null}
        </div>
        <nav className="mt-5 flex overflow-x-auto" aria-label="Form sections">
          <ViewTab href={`?view=form`} active={view === "form"}>Form</ViewTab>
          <ViewTab href={`?view=responses`} active={view === "responses"} count={responseCount}>Responses</ViewTab>
          <ViewTab href={`?view=settings`} active={view === "settings"}>Questions &amp; settings</ViewTab>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-5 py-7">
      {view === "form" ? <div className="mx-auto max-w-3xl">
        <section className="mb-4 overflow-hidden rounded-card border border-line bg-card shadow-sm"><div className="h-2 bg-powder" /><div className="p-6 sm:p-8"><h2 className="text-2xl font-bold">{table.data.name}</h2>{table.data.description ? <p className="mt-2 whitespace-pre-wrap text-muted">{table.data.description}</p> : null}<p className="mt-5 text-xs text-muted"><span className="text-orange">*</span> Required question · Responses are visible only to authorized Club managers.</p></div></section>
        <ResponseForm clubId={id} tableId={tableId} columns={columns} />
      </div> : null}

      {view === "responses" ? <div className="space-y-6">
        <section className="rounded-card border border-line bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-widest text-powder">Responses</p><h2 className="mt-1 text-2xl font-bold">{responseCount}{responseCount === 1000 ? "+" : ""} recorded</h2><p className="mt-1 text-sm text-muted">Search, sort and edit the latest 1,000 responses.</p></div>
            <form className="grid w-full gap-2 sm:grid-cols-[minmax(180px,1fr)_170px_140px_auto] lg:w-auto">
              <input type="hidden" name="view" value="responses" />
              <input name="q" defaultValue={search.q ?? ""} maxLength={80} placeholder="Search responses" className={input} />
              <select name="sort" defaultValue={sort} aria-label="Sort field" className={input}><option value="created_at">Recorded time</option>{columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select>
              <select name="direction" defaultValue={direction} aria-label="Sort direction" className={input}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select>
              <button className="h-11 rounded-full bg-navy px-5 text-sm font-bold text-cream">Apply</button>
            </form>
          </div>
          {rows.error ? <p role="alert" className="mt-5 text-orange">Responses could not be loaded.</p> : pageRows.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-max text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th className="px-3 py-3">Recorded</th>{columns.map(column => <th key={column.key} className="px-3 py-3">{column.label}</th>)}<th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-line">{pageRows.map(row => <tr key={row.id} className="hover:bg-content-bg/60"><td className="whitespace-nowrap px-3 py-3 text-muted">{new Date(row.created_at).toLocaleString("en-US")}{row.updated_by ? <span className="block text-[10px]">edited</span> : null}</td>{columns.map(column => <td key={column.key} className="max-w-80 break-words px-3 py-3">{display(column, row.data[column.key])}</td>)}<td className="px-3 py-3"><details><summary className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold text-navy hover:bg-content-bg">Edit</summary><div className="absolute right-6 z-20 mt-2 w-[min(88vw,640px)] rounded-card border border-line bg-card p-4 shadow-xl"><ActionFeedbackForm action={updateCustomTableRow} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="club_id" value={id} /><input type="hidden" name="table_id" value={tableId} /><input type="hidden" name="row_id" value={row.id} />{columns.map(column => <CellInput key={column.key} column={column} value={row.data[column.key]} />)}<button className="h-10 rounded-full bg-navy px-4 text-sm font-bold text-cream">Save changes</button></ActionFeedbackForm><ActionFeedbackForm action={deleteCustomTableRow} className="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3"><input type="hidden" name="club_id" value={id} /><input type="hidden" name="table_id" value={tableId} /><input type="hidden" name="row_id" value={row.id} /><label className="text-xs text-muted"><input type="checkbox" name="confirm" value="yes" required /> Confirm deletion</label><button className="text-xs font-bold text-orange">Delete response</button></ActionFeedbackForm></div></details></td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-control border border-dashed border-line p-8 text-center text-muted">{query ? "No responses match this search." : "No responses yet. Open the Form tab to add the first one."}</div>}
          <Pagination basePath={`/clubs/manage/${id}/tables/${tableId}`} page={page} total={filtered.length} pageSize={PAGE_SIZE} query={{ view: "responses", q: search.q ?? "", sort, direction }} />
        </section>

        <section className="rounded-card border border-line bg-card p-6 shadow-sm"><div className="grid gap-6 lg:grid-cols-[1fr_auto]"><div><h2 className="text-xl font-bold">Import responses</h2><p className="mt-2 text-sm text-muted">Upload a CSV whose headers match question names or internal keys. Every row is checked before anything is added. Maximum 500 rows and 1 MB.</p></div><ActionFeedbackForm action={importCustomTableCsv} className="flex flex-wrap items-center gap-3"><input type="hidden" name="club_id" value={id} /><input type="hidden" name="table_id" value={tableId} /><input type="file" name="csv" accept=".csv,text/csv" required className="text-sm" /><button className="h-10 rounded-full border border-line px-5 text-sm font-bold hover:bg-content-bg">Import CSV</button></ActionFeedbackForm></div></section>
      </div> : null}

      {view === "settings" ? <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-card border border-line bg-card p-6 shadow-sm"><h2 className="text-xl font-bold">Public sharing</h2><p className="mt-2 text-sm text-muted">Create an unguessable link that anyone can use without signing in. Only current Club board members and this Club&apos;s Advisors can see responses or change this form.</p><ShareLinkForm clubId={id} tableId={tableId}/>{links.error?<p className="mt-3 text-sm text-orange">Apply club_custom_forms_sharing.sql to enable public links.</p>:<div className="mt-4 space-y-2">{links.data?.map(link=><div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3 text-xs"><span>{link.active?"Active":"Revoked"}{link.expires_at?` · expires ${new Date(link.expires_at).toLocaleString("en-US")}`:" · no expiration"}</span>{link.active?<ActionFeedbackForm action={revokeCustomFormLink}><input type="hidden" name="club_id" value={id}/><input type="hidden" name="table_id" value={tableId}/><input type="hidden" name="link_id" value={link.id}/><button className="font-bold text-orange">Revoke</button></ActionFeedbackForm>:null}</div>)}</div>}</section>
        <div><p className="text-xs font-bold uppercase tracking-widest text-powder">Form builder</p><h2 className="mt-1 text-2xl font-bold">Questions &amp; settings</h2><p className="mt-2 text-sm text-muted">Add, duplicate and reorder questions. Changes apply to future entries and response editing.</p></div>
        <TableBuilder clubId={id} table={table.data} />
        <section className="rounded-card border border-line bg-card p-6 shadow-sm"><h2 className="text-xl font-bold">Make a copy</h2><p className="mt-2 text-sm text-muted">Create a blank form with the same questions and validation settings.</p><ActionFeedbackForm action={duplicateCustomTable} className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="club_id" value={id} /><input type="hidden" name="table_id" value={tableId} /><input name="name" required minLength={2} maxLength={80} defaultValue={`${table.data.name} copy`} className={input} /><button className="h-11 shrink-0 rounded-full border border-line px-5 text-sm font-bold hover:bg-content-bg">Create copy</button></ActionFeedbackForm></section>
      </div> : null}
    </main>
  </div>;
}
