import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { applyClubImport, bulkUpdateClubs, importClubsCsv, rollbackClubImport } from "./actions";

export default async function AdminDataPage() {
  await requireAdmin();
  const db = await createServerClient();
  const [clubs, batches] = await Promise.all([
    db.from("clubs").select("id,name,status,category,school_year").order("name").limit(500),
    db.from("club_import_batches").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const batchIds = (batches.data ?? []).map((batch) => batch.id);
  const previewRows = batchIds.length
    ? await db.from("club_import_rows").select("batch_id,row_number,payload,errors").in("batch_id", batchIds).not("errors", "eq", "{}").order("row_number").limit(50)
    : { data: [] };
  const errorsByBatch = new Map<string, typeof previewRows.data>();
  for (const row of previewRows.data ?? []) errorsByBatch.set(row.batch_id, [...(errorsByBatch.get(row.batch_id) ?? []), row]);

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <PageHeader title="Club Data Tools" subtitle="Import a Club roster safely, including meetings and Advisors who have not registered yet." />
    <div className="mt-7 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-card border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold">Quick CSV import</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Upload, review the preview, then apply. Existing Clubs with the same generated URL slug are updated; repeated Club rows can add more meetings or Advisors.</p></div>
          <a href="/templates/club-roster-import.csv" download className="inline-flex h-10 items-center rounded-full border border-navy px-4 text-sm font-bold text-navy">Download template</a>
        </div>
        <div className="mt-4 overflow-x-auto rounded-control border border-line bg-content-bg p-3">
          <code className="whitespace-nowrap text-xs text-ink">CLUB, Advisor, Advisor email, DAY, ROOM, Period</code>
        </div>
        <ul className="mt-3 space-y-1 text-xs leading-5 text-muted">
          <li>DAY accepts Monday–Sunday, abbreviations such as Thu, or 1–7.</li>
          <li>Period accepts 1–11 and automatically uses the school bell schedule.</li>
          <li>If the Advisor has not registered, their email is held securely and access is granted automatically after they register with that same email.</li>
        </ul>
        <ActionFeedbackForm action={importClubsCsv} className="mt-5 grid gap-3">
          <input type="file" name="csv" accept="text/csv,.csv" required className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-content-bg file:px-4 file:py-2 file:font-semibold file:text-ink" />
          <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Preview CSV</button>
        </ActionFeedbackForm>
        <div className="mt-6 space-y-3">
          {(batches.data ?? []).map((batch) => {
            const rowErrors = errorsByBatch.get(batch.id) ?? [];
            return <article key={batch.id} className="rounded-control border border-line p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2"><b className="break-all">{batch.file_name}</b><span className="rounded-full bg-content-bg px-2 py-1 text-[10px] font-bold uppercase text-muted">{batch.status}</span></div>
              <p className="mt-1 text-xs text-muted">{batch.valid_rows} valid · {batch.error_rows} errors · {new Date(batch.created_at).toLocaleString("en-US")}</p>
              {rowErrors.length ? <ul className="mt-2 space-y-1 rounded-control bg-content-bg p-2 text-xs text-orange">{rowErrors.slice(0, 8).map((row) => <li key={row.row_number}>Row {row.row_number}: {row.errors.join("; ")}</li>)}</ul> : null}
              {batch.status === "preview" ? <ActionFeedbackForm action={applyClubImport} className="mt-3"><input type="hidden" name="batch_id" value={batch.id} /><button disabled={batch.error_rows > 0} className="text-xs font-bold text-navy disabled:opacity-40">{batch.error_rows ? "Correct the CSV and upload again" : "Apply this preview"}</button></ActionFeedbackForm> : null}
              {["applied", "failed"].includes(batch.status) ? <ActionFeedbackForm action={rollbackClubImport} className="mt-3"><input type="hidden" name="batch_id" value={batch.id} /><button className="text-xs font-bold text-orange">Rollback this batch</button></ActionFeedbackForm> : null}
            </article>;
          })}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-5 sm:p-6">
        <h2 className="text-xl font-bold">Bulk actions</h2>
        <ActionFeedbackForm action={bulkUpdateClubs} className="mt-4 grid gap-3">
          <div className="max-h-72 space-y-2 overflow-auto rounded-control border border-line p-3">{clubs.data?.map((club) => <label key={club.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="club_id" value={club.id} /><span className="flex-1">{club.name}</span><span className="text-xs text-muted">{club.status} · {club.category ?? "uncategorized"} · {club.school_year ?? "no year"}</span></label>)}</div>
          <select name="operation" required className="h-11 rounded-control border border-line bg-content-bg px-3"><option value="">Choose action</option><option value="archive">Archive</option><option value="category">Set category</option><option value="year">Set school year</option><option value="advisor">Assign Advisor by email</option></select>
          <input name="value" placeholder="Category, 2026-2027, or Advisor email" className="h-11 rounded-control border border-line bg-content-bg px-3" />
          <p className="text-xs leading-5 text-muted">Advisor emails may be assigned before the person registers; access is claimed automatically later.</p>
          <label className="text-sm"><input type="checkbox" name="confirm" value="yes" required /> I reviewed the selected Clubs and understand this changes them together.</label>
          <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Apply bulk action</button>
        </ActionFeedbackForm>
      </section>
    </div>
  </div>;
}
