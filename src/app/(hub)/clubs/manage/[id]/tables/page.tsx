import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import TableBuilder from "./table-builder";
import { deleteCustomTable } from "./actions";

export default async function ClubTablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/clubs/manage/${id}/tables`)}`);
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club_forms", { p_club_id: id });
  if (!access.data) redirect("/clubs/manage");
  const [club, tables] = await Promise.all([
    db.from("clubs").select("id,name").eq("id", id).maybeSingle(),
    db.from("club_custom_tables").select("*").eq("club_id", id).order("created_at", { ascending: false }),
  ]);
  if (!club.data) notFound();
  const counts = new Map<string, number>();
  await Promise.all((tables.data ?? []).map(async table => {
    const result = await db.from("club_custom_table_rows").select("id", { count: "exact", head: true }).eq("table_id", table.id);
    counts.set(table.id, result.count ?? 0);
  }));
  return <div className="mx-auto max-w-6xl space-y-7 px-5 py-8 text-ink">
    <header><Link href={`/clubs/manage/${id}`} className="text-sm font-semibold text-powder">← {club.data.name} workspace</Link><h1 className="mt-4 font-display text-4xl font-bold uppercase">Custom forms</h1><p className="mt-2 max-w-3xl text-muted">Build simple Club forms, collect responses online, review them in a table, and export them as CSV. Forms are visible only to this Club&apos;s authorized managers.</p></header>
    {tables.error && <p role="alert" className="rounded-card border border-orange/40 bg-card p-5">Run <code>supabase/club_custom_tables.sql</code> to enable custom tables.</p>}
    <section className="mx-auto w-full max-w-4xl"><p className="text-xs font-bold uppercase tracking-widest text-powder">Form builder</p><h2 className="mt-1 text-2xl font-bold">Create a form</h2><p className="mt-2 text-sm text-muted">Do not store passwords, Social Security numbers, medical information, payment-card data, or other sensitive records.</p><TableBuilder clubId={id} /></section>
    <section><h2 className="text-2xl font-bold">Saved forms</h2>{tables.data?.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{tables.data.map(table => <article key={table.id} className="rounded-card border border-line bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{table.name}</h3><p className="mt-1 text-sm text-muted">{table.description || "No description"}</p></div><span className="rounded-full bg-content-bg px-3 py-1 text-xs font-semibold text-muted">{counts.get(table.id) ?? 0} responses</span></div><p className="mt-3 text-xs text-muted">{table.columns.length} questions · created {new Date(table.created_at).toLocaleDateString("en-US")}</p><div className="mt-4 flex flex-wrap gap-3"><Link href={`/clubs/manage/${id}/tables/${table.id}`} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-cream">Open form</Link><a href={`/clubs/manage/${id}/tables/${table.id}/export`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Export CSV</a></div><ActionFeedbackForm action={deleteCustomTable} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3"><input type="hidden" name="club_id" value={id} /><input type="hidden" name="table_id" value={table.id} /><label className="text-xs text-muted"><input type="checkbox" name="confirm" value="delete" required /> Delete form and all responses</label><button className="ml-auto text-xs font-bold text-orange">Delete</button></ActionFeedbackForm></article>)}</div> : <p className="mt-4 rounded-card border border-line bg-card p-6 text-muted">No custom forms yet.</p>}</section>
  </div>;
}
