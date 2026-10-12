"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/club-finance";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

async function staff() {
  const user = await getCurrentUser();
  if (!user || !["staff", "admin"].includes(user.role) || !isSupabaseConfigured()) return null;
  return { user, db: await createServerClient() };
}

export async function reviewWorkflow(fd: FormData) {
  const context = await staff();
  if (!context) return { ok: false, message: "Staff access is required." };
  const kind = String(fd.get("kind") ?? "");
  const id = String(fd.get("id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!id || !["approve", "reject", "waitlist", "paid"].includes(decision) || note.length > 1000) return { ok: false, message: "Check the decision and note." };
  let error = null;
  if (kind === "trip") {
    error = (await context.db.from("club_trips").update({ status: decision === "approve" ? "approved" : "rejected", reviewed_by: context.user.id, review_note: note || null }).eq("id", id).eq("status", "submitted")).error;
  } else if (kind === "event") {
    const row = await context.db.from("event_approval_requests").update({ status: decision === "approve" ? "approved" : "rejected", reviewed_by: context.user.id, review_note: note || null }).eq("id", id).eq("status", "pending").select("*").maybeSingle();
    error = row.error;
    if (row.data && decision === "approve") error = (await context.db.from("events").insert({ title: row.data.title, description: row.data.description, event_type: "club", club_id: row.data.club_id, start_at: row.data.start_at, end_at: row.data.end_at, location: row.data.location, price_label: "Free", published: true, created_by: context.user.id })).error;
  } else if (kind === "permit") {
    const status = decision === "approve" ? "approved" : "rejected";
    error = (await context.db.from("facility_permits").update({ overall_status: status, room_status: status, security_status: status, library_status: status, av_status: status, review_note: note || null }).eq("id", id).eq("overall_status", "pending")).error;
  } else if (kind === "reimbursement") {
    const amountCents = parseMoneyToCents(fd.get("amount"));
    if (!amountCents) return { ok: false, message: "Enter a valid reimbursement amount." };
    const nextStatus = decision === "approve" ? "approved" : decision === "paid" ? "paid" : "rejected";
    let query = context.db.from("club_reimbursements").update({ amount_cents: amountCents, status: nextStatus, reviewed_by: context.user.id, review_note: note || null }).eq("id", id);
    query = decision === "paid" ? query.eq("status", "approved") : query.in("status", ["pending", "approved"]);
    const result = await query.select("id").maybeSingle();
    if (!result.data && !result.error) return { ok: false, message: decision === "paid" ? "Approve this reimbursement before marking it paid." : "This ticket was already completed." };
    error = result.error;
  } else if (kind === "registration") {
    error = (await context.db.from("event_registrations").update({ status: decision === "approve" ? "approved" : decision === "waitlist" ? "waitlisted" : "rejected", reviewed_by: context.user.id, review_note: note || null }).eq("id", id).eq("status", "pending")).error;
  } else return { ok: false, message: "Unknown workflow." };
  if (error) return { ok: false, message: "Decision could not be saved." };
  revalidatePath("/admin/workflows");
  revalidatePath("/events", "layout");
  return { ok: true, message: "Decision saved." };
}
