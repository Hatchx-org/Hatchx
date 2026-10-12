import Link from "next/link";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { reviewWorkflow } from "./actions";

type QueueRow = { id: string; title: string; meta: string; amount?: string; attachments?: Array<{ name: string; href: string }> };

export default async function WorkflowsPage() {
  await requireStaff();
  const db = await createServerClient();
  const [trips, events, permits, reimbursements, registrations, attachments] = await Promise.all([
    db.from("club_trips").select("*").eq("status", "submitted").order("trip_date"),
    db.from("event_approval_requests").select("*").eq("status", "pending").order("created_at"),
    db.from("facility_permits").select("*").eq("overall_status", "pending").order("event_date"),
    db.from("club_reimbursements").select("*").in("status", ["pending", "approved"]).order("created_at"),
    db.from("event_registrations").select("*").eq("status", "pending").order("created_at"),
    db.from("club_reimbursement_attachments").select("*"),
  ]);
  const unavailable = [trips, events, permits, reimbursements, registrations, attachments].some(result => Boolean(result.error));
  return <div className="mx-auto max-w-6xl px-6 py-8">
    <PageHeader title="Approval Workflows" subtitle="Review trips, events, registrations, reimbursements, and building permits from one queue." />
    {unavailable && <p role="alert" className="mt-5 rounded-card border border-orange/40 bg-card p-5">Run the school operations and finance permissions migrations to enable all queues.</p>}
    <div className="mt-7 grid gap-6 lg:grid-cols-2">
      <Queue title="Trip plan approval" kind="trip" rows={(trips.data ?? []).map(row => ({ id: row.id, title: row.title, meta: `${row.trip_date} · ${row.destination} · consent ${row.consent_required ? "required" : "not required"}` }))} />
      <Queue title="BHS event approval" kind="event" rows={(events.data ?? []).map(row => ({ id: row.id, title: row.title, meta: `${new Date(row.start_at).toLocaleString("en-US")} · ${row.location ?? "TBA"}` }))} />
      <Queue title="Building / room / service permits" kind="permit" rows={(permits.data ?? []).map(row => ({ id: row.id, title: row.title, meta: `${row.event_date} · room ${row.room ?? "TBA"} · security ${row.security_status} · library ${row.library_status} · A/V ${row.av_status}` }))} />
      <Queue title="Reimbursements & receipts" kind="reimbursement" rows={(reimbursements.data ?? []).map(row => ({ id: row.id, title: `$${(row.amount_cents / 100).toFixed(2)} · ${row.purpose}`, meta: `${row.status} · receipt ${row.receipt_reference}`, amount: (row.amount_cents / 100).toFixed(2), attachments: (attachments.data ?? []).filter(file => file.reimbursement_id === row.id).map(file => ({ name: file.file_name, href: `/clubs/manage/${row.club_id}/finance/receipts/${file.id}` })) }))} />
      <Queue title="Event registration approval" kind="registration" rows={(registrations.data ?? []).map(row => ({ id: row.id, title: `Registration ${row.id.slice(0, 8)}`, meta: `Event ${row.approval_id.slice(0, 8)} · student ${row.profile_id.slice(0, 8)}` }))} />
    </div>
  </div>;
}

function Queue({ title, kind, rows }: { title: string; kind: string; rows: QueueRow[] }) {
  return <section className="rounded-card border border-line bg-card p-6"><h2 className="text-xl font-bold text-ink">{title}</h2>{rows.length ? <div className="mt-4 space-y-3">{rows.map(row => <article key={row.id} className="rounded-control bg-content-bg p-4"><b className="text-ink">{row.title}</b><p className="mt-1 text-xs text-muted">{row.meta}</p>{row.attachments?.length ? <div className="mt-2 flex flex-wrap gap-3">{row.attachments.map(file => <Link key={file.href} href={file.href} className="text-xs font-semibold text-navy underline">Open {file.name}</Link>)}</div> : null}<ActionFeedbackForm action={reviewWorkflow} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={row.id} />{kind === "reimbursement" && <label className="text-xs font-semibold text-muted">Approved amount<input name="amount" required inputMode="decimal" defaultValue={row.amount} className="mt-1 h-9 w-full rounded-control border border-line bg-card px-3 text-sm text-ink" /></label>}<input name="note" maxLength={1000} placeholder="Decision note" className="h-9 rounded-control border border-line bg-card px-3 text-sm" /><button name="decision" value="approve" className="rounded-full bg-navy px-3 text-xs font-bold text-cream">Approve</button><button name="decision" value="reject" className="rounded-full border border-line px-3 text-xs font-bold text-ink">Reject</button>{kind === "registration" && <button name="decision" value="waitlist" className="text-xs font-bold text-navy">Waitlist</button>}{kind === "reimbursement" && <button name="decision" value="paid" className="text-xs font-bold text-navy">Mark paid</button>}</ActionFeedbackForm></article>)}</div> : <p className="mt-4 text-sm text-muted">Queue is clear.</p>}</section>;
}
