"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { daysBetween, parseMoneyToCents, parseNonNegativeMoneyToCents, schoolYearIsValid } from "@/lib/club-finance";
import { parseOptionalDateOnly } from "@/lib/input-validation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

const denied = { ok: false, message: "Club board, Treasurer, Advisor, or Staff access is required." };
const invalid = { ok: false, message: "Check the amount, dates, school year, and required details." };

async function financeContext(clubId: string) {
  const user = await getCurrentUser();
  if (!user || !clubId || !isSupabaseConfigured()) return null;
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club", { p_club_id: clubId });
  return access.data ? { user, db } : null;
}

export async function createFundraiser(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context) return denied;
  if (!["staff", "admin"].includes(context.user.role)) return { ok: false, message: "Only Staff or Admin can create fundraising records." };
  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const schoolYear = String(formData.get("school_year") ?? "").trim();
  const targetCents = parseMoneyToCents(formData.get("target_amount"));
  const plannedStart = parseOptionalDateOnly(String(formData.get("planned_start") ?? ""));
  const plannedEnd = parseOptionalDateOnly(String(formData.get("planned_end") ?? ""));
  if (title.length < 3 || title.length > 120 || purpose.length < 10 || purpose.length > 2000 || !schoolYearIsValid(schoolYear) || !targetCents || !plannedStart || !plannedEnd || plannedEnd < plannedStart) return invalid;
  const { error } = await context.db.from("club_fundraisers").insert({ club_id: clubId, school_year: schoolYear, title, purpose, target_cents: targetCents, planned_start: plannedStart, planned_end: plannedEnd, status: "pending_treasurer", submitted_by: context.user.id });
  if (error) return { ok: false, message: "The fundraiser was not submitted. Run the club finance migration or check access." };
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  const notice = daysBetween(new Date().toISOString().slice(0, 10), plannedStart);
  return { ok: true, message: notice < 30 ? `Submitted to the Treasurer with a warning: only ${Math.max(0, notice)} days of notice.` : "Submitted to the Treasurer for approval." };
}

export async function reviewFundraiser(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context) return denied;
  if (!["staff", "admin"].includes(context.user.role)) return { ok: false, message: "Only Staff or Admin can approve fundraising records." };
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 1000) return invalid;
  const result = await context.db.rpc("review_club_fundraiser", { p_fundraiser_id: String(formData.get("fundraiser_id") ?? ""), p_approve: approve, p_note: note });
  if (result.error || !result.data) return { ok: false, message: "Only the current Treasurer, Advisor, Staff, or Admin can review a pending fundraiser." };
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  return { ok: true, message: approve ? "Fundraiser approved." : "Fundraiser returned with the decision recorded." };
}

export async function closeFundraiser(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context) return denied;
  if (!["staff", "admin"].includes(context.user.role)) return { ok: false, message: "Only Staff or Admin can enter final fundraising amounts." };
  const statement = String(formData.get("statement") ?? "").trim();
  const proceeds = parseNonNegativeMoneyToCents(formData.get("proceeds"));
  const expenses = parseNonNegativeMoneyToCents(formData.get("expenses"));
  if (statement.length < 10 || statement.length > 4000 || proceeds === null || expenses === null) return invalid;
  const result = await context.db.rpc("close_club_fundraiser", { p_fundraiser_id: String(formData.get("fundraiser_id") ?? ""), p_statement: statement, p_proceeds_cents: proceeds, p_expenses_cents: expenses });
  if (result.error || !result.data) return { ok: false, message: "The final statement could not be filed. The fundraiser must be approved first." };
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  return { ok: true, message: "Final statement filed and fundraiser closed." };
}

export async function recordFinanceTransaction(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context) return denied;
  if (!["staff", "admin"].includes(context.user.role)) return { ok: false, message: "Only Staff or Admin can add official ledger entries." };
  const schoolYear = String(formData.get("school_year") ?? "").trim();
  const entryType = formData.get("entry_type") === "income" ? "income" : "expense";
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const occurredOn = parseOptionalDateOnly(String(formData.get("occurred_on") ?? ""));
  const receiptReference = String(formData.get("receipt_reference") ?? "").trim();
  const fundraiserId = String(formData.get("fundraiser_id") ?? "");
  if (!schoolYearIsValid(schoolYear) || !amountCents || category.length < 2 || category.length > 80 || description.length < 3 || description.length > 1000 || !occurredOn || receiptReference.length > 500) return invalid;
  if (fundraiserId) {
    const fundraiser = await context.db.from("club_fundraisers").select("id").eq("id", fundraiserId).eq("club_id", clubId).maybeSingle();
    if (!fundraiser.data) return { ok: false, message: "Choose a fundraiser belonging to this club." };
  }
  const { error } = await context.db.from("club_finance_transactions").insert({ club_id: clubId, school_year: schoolYear, entry_type: entryType, amount_cents: amountCents, category, description, occurred_on: occurredOn, receipt_reference: receiptReference || null, fundraiser_id: fundraiserId || null, created_by: context.user.id });
  if (error) return { ok: false, message: "The ledger entry was not saved. Check the finance migration and your access." };
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  return { ok: true, message: "Ledger entry recorded. Any later correction will be audited." };
}

export async function updateFinanceTransaction(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context || !["staff", "admin"].includes(context.user.role)) return { ok: false, message: "Only Staff or Admin can edit ledger amounts." };
  const transactionId = String(formData.get("transaction_id") ?? "");
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const receiptReference = String(formData.get("receipt_reference") ?? "").trim();
  if (!transactionId || !amountCents || description.length < 3 || description.length > 1000 || receiptReference.length > 500) return invalid;
  const result = await context.db.from("club_finance_transactions").update({ amount_cents: amountCents, description, receipt_reference: receiptReference || null, updated_by: context.user.id, updated_at: new Date().toISOString() }).eq("id", transactionId).eq("club_id", clubId).select("id").maybeSingle();
  if (result.error || !result.data) return { ok: false, message: "The ledger entry could not be updated. Apply finance_permissions_and_reimbursements.sql." };
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  return { ok: true, message: "Ledger amount and details updated; the audit log retains the change." };
}

export async function submitReimbursement(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await financeContext(clubId);
  if (!context) return denied;
  const schoolYear = String(formData.get("school_year") ?? "");
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const purpose = String(formData.get("purpose") ?? "").trim();
  const reference = String(formData.get("receipt_reference") ?? "").trim();
  const files = formData.getAll("attachments").filter((item): item is File => item instanceof File && item.size > 0);
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (!schoolYearIsValid(schoolYear) || !amountCents || purpose.length < 10 || purpose.length > 2000 || reference.length > 500 || files.length > 3 || totalBytes > 4 * 1024 * 1024 || files.some(file => !allowedTypes.has(file.type))) {
    return { ok: false, message: "Check the amount and description. Attach up to 3 PDF/JPG/PNG/WebP files totaling no more than 4 MB." };
  }
  if (!files.length && !reference) return { ok: false, message: "Add at least one receipt file, photo, or reference number." };
  const reimbursementId = crypto.randomUUID();
  const uploaded: Array<{ storage_path: string; file_name: string; mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"; file_size: number; uploaded_by: string; reimbursement_id: string }> = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "attachment";
    const storagePath = `${clubId}/${reimbursementId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await context.db.storage.from("club-receipts").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      if (uploaded.length) await context.db.storage.from("club-receipts").remove(uploaded.map(item => item.storage_path));
      return { ok: false, message: "An attachment could not be uploaded. Apply the finance workflow migration and try again." };
    }
    uploaded.push({ reimbursement_id: reimbursementId, storage_path: storagePath, file_name: safeName, mime_type: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp", file_size: file.size, uploaded_by: context.user.id });
  }
  const ticket = await context.db.from("club_reimbursements").insert({ id: reimbursementId, club_id: clubId, school_year: schoolYear, amount_cents: amountCents, purpose, receipt_reference: reference || uploaded[0]?.file_name || "Attachment uploaded", receipt_path: uploaded[0]?.storage_path ?? null, status: "pending", submitted_by: context.user.id });
  if (ticket.error) {
    if (uploaded.length) await context.db.storage.from("club-receipts").remove(uploaded.map(item => item.storage_path));
    return { ok: false, message: "The reimbursement ticket could not be created." };
  }
  if (uploaded.length) {
    const attachments = await context.db.from("club_reimbursement_attachments").insert(uploaded);
    if (attachments.error) {
      await context.db.from("club_reimbursements").delete().eq("id", reimbursementId).eq("submitted_by", context.user.id).eq("status", "pending");
      await context.db.storage.from("club-receipts").remove(uploaded.map(item => item.storage_path));
      return { ok: false, message: "Attachment records could not be saved. Apply finance_permissions_and_reimbursements.sql." };
    }
  }
  revalidatePath(`/clubs/manage/${clubId}/finance`);
  revalidatePath("/admin/workflows");
  return { ok: true, message: "Reimbursement ticket submitted to Staff/Admin for review." };
}
