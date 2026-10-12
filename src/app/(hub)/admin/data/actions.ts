"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { CLUB_ROSTER_REQUIRED_HEADERS, clubRosterMeeting, normalizeClubRosterHeaders, parseClubRosterRow, type ClubRosterPayload } from "@/lib/club-roster-import";
import type { ClubRow } from "@/lib/supabase/types";

async function admin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? { user, db: await createServerClient() } : null;
}

function refreshDataPages() {
  revalidatePath("/clubs", "layout");
  revalidatePath("/calendar");
  revalidatePath("/admin/data");
}

export async function importClubsCsv(formData: FormData) {
  const context = await admin();
  if (!context) return { ok: false, message: "Admin access required." };
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size > 1_000_000) return { ok: false, message: "Choose a CSV file up to 1 MB." };
  const parsed = parseCsv(await file.text());
  const headers = normalizeClubRosterHeaders(parsed.shift() ?? []);
  const missing = CLUB_ROSTER_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) return { ok: false, message: `Missing required columns: ${missing.join(", ")}. Download the template and keep its headings.` };
  if (!parsed.length) return { ok: false, message: "The CSV does not contain any Club rows." };
  if (parsed.length > 500) return { ok: false, message: "Import at most 500 rows at once." };

  const preview = parsed.map((values, index) => ({ row_number: index + 2, ...parseClubRosterRow(headers, values) }));
  const validRows = preview.filter((row) => !row.errors.length).length;
  const errorRows = preview.length - validRows;
  const batch = await context.db.from("club_import_batches").insert({ created_by: context.user.id, file_name: file.name, total_rows: preview.length, valid_rows: validRows, error_rows: errorRows, status: "preview" }).select("id").maybeSingle();
  if (!batch.data) return { ok: false, message: "CSV preview requires supabase/schema.sql and supabase/schema.sql." };
  const savedRows = await context.db.from("club_import_rows").insert(preview.map((row) => ({ ...row, batch_id: batch.data!.id })));
  if (savedRows.error) return { ok: false, message: "The CSV preview could not be saved." };
  revalidatePath("/admin/data");
  return { ok: true, message: `Preview ready: ${validRows} valid, ${errorRows} with errors. Nothing has been imported yet.` };
}

type DatabaseClient = Awaited<ReturnType<typeof createServerClient>>;
async function logRelatedRecord(db: DatabaseClient, batchId: string, rowId: number, entityType: "meeting" | "advisor" | "pending_advisor", entityId: string) {
  return db.from("club_import_related_records").insert({ batch_id: batchId, import_row_id: rowId, entity_type: entityType, entity_id: entityId });
}

export async function applyClubImport(formData: FormData) {
  const context = await admin();
  if (!context) return { ok: false, message: "Admin access required." };
  const batchId = String(formData.get("batch_id") ?? "");
  const batch = await context.db.from("club_import_batches").select("*").eq("id", batchId).eq("status", "preview").maybeSingle();
  if (!batch.data || batch.data.error_rows > 0) return { ok: false, message: "Resolve all preview errors before importing." };
  const rows = await context.db.from("club_import_rows").select("*").eq("batch_id", batchId).order("row_number");
  if (rows.error) return { ok: false, message: "Import rows could not be loaded." };

  let count = 0;
  for (const row of rows.data ?? []) {
    const payload = row.payload as ClubRosterPayload;
    const meeting = clubRosterMeeting(payload);
    if (!meeting) continue;
    const existing = await context.db.from("clubs").select("*").eq("slug", payload.slug).maybeSingle();
    const clubValues: Partial<ClubRow> = existing.data ? {
      name: payload.club,
      category: payload.category || existing.data.category || null,
      school_year: payload.school_year || existing.data.school_year || null,
      status: payload.status as "draft" | "published" | "archived",
    } : {
      slug: payload.slug,
      name: payload.club,
      short_description: payload.description || "Club information imported by the school administration.",
      category: payload.category || null,
      school_year: payload.school_year || null,
      status: payload.status as "draft" | "published" | "archived",
      created_by: context.user.id,
    };
    const saved = await context.db.from("clubs").upsert(clubValues, { onConflict: "slug" }).select("id").maybeSingle();
    if (!saved.data) {
      await context.db.from("club_import_batches").update({ status: "failed" }).eq("id", batchId);
      return { ok: false, message: `Import stopped at CSV row ${row.row_number}; earlier rows may have been applied and can be rolled back.` };
    }
    const clubId = saved.data.id;
    await context.db.from("club_import_rows").update({ before_state: existing.data as Record<string, unknown> | null, club_id: clubId, action: existing.data ? "update" : "insert" }).eq("id", row.id);

    const existingMeeting = await context.db.from("club_meetings").select("id").eq("club_id", clubId).eq("day_of_week", meeting.day_of_week).eq("start_time", meeting.start_time).eq("location", meeting.location).maybeSingle();
    if (!existingMeeting.data) {
      const inserted = await context.db.from("club_meetings").insert({ club_id: clubId, ...meeting, recurrence_note: null }).select("id").maybeSingle();
      if (inserted.data) await logRelatedRecord(context.db, batchId, row.id, "meeting", inserted.data.id);
    }

    const profile = await context.db.from("profiles").select("id,full_name,email,role").eq("email", payload.advisor_email).maybeSingle();
    if (profile.data && ["teacher", "advisor"].includes(profile.data.role)) {
      const existingAdvisor = await context.db.from("club_advisors").select("id").eq("club_id", clubId).eq("profile_id", profile.data.id).maybeSingle();
      const advisor = await context.db.from("club_advisors").upsert({ club_id: clubId, profile_id: profile.data.id, display_name: payload.advisor || profile.data.full_name, contact_email: payload.advisor_email }, { onConflict: "club_id,profile_id" }).select("id").maybeSingle();
      if (!existingAdvisor.data && advisor.data) await logRelatedRecord(context.db, batchId, row.id, "advisor", advisor.data.id);
    } else {
      const existingPending = await context.db.from("pending_club_advisors").select("id").eq("club_id", clubId).eq("email", payload.advisor_email).maybeSingle();
      const pending = await context.db.from("pending_club_advisors").upsert({ club_id: clubId, email: payload.advisor_email, display_name: payload.advisor, created_by: context.user.id }, { onConflict: "club_id,email" }).select("id").maybeSingle();
      if (!pending.data) return { ok: false, message: "Apply supabase/schema.sql before importing unregistered Advisors." };
      if (!existingPending.data) await logRelatedRecord(context.db, batchId, row.id, "pending_advisor", pending.data.id);
    }
    count += 1;
  }
  await context.db.from("club_import_batches").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", batchId);
  refreshDataPages();
  return { ok: true, message: `Imported ${count} rows. Clubs, Advisor assignments, days, rooms, and periods are ready.` };
}

export async function rollbackClubImport(formData: FormData) {
  const context = await admin();
  if (!context) return { ok: false, message: "Admin access required." };
  const batchId = String(formData.get("batch_id") ?? "");
  const batch = await context.db.from("club_import_batches").select("id").eq("id", batchId).in("status", ["applied", "failed"]).maybeSingle();
  if (!batch.data) return { ok: false, message: "Only applied or failed batches can be rolled back." };
  const related = await context.db.from("club_import_related_records").select("*").eq("batch_id", batchId).order("id", { ascending: false });
  for (const record of related.data ?? []) {
    if (record.entity_type === "meeting") await context.db.from("club_meetings").delete().eq("id", record.entity_id);
    if (record.entity_type === "advisor") await context.db.from("club_advisors").delete().eq("id", record.entity_id);
    if (record.entity_type === "pending_advisor") {
      const pending = await context.db.from("pending_club_advisors").select("club_id,claimed_profile_id").eq("id", record.entity_id).maybeSingle();
      if (pending.data?.claimed_profile_id) await context.db.from("club_advisors").delete().eq("club_id", pending.data.club_id).eq("profile_id", pending.data.claimed_profile_id);
      await context.db.from("pending_club_advisors").delete().eq("id", record.entity_id);
    }
  }
  const rows = await context.db.from("club_import_rows").select("*").eq("batch_id", batchId).order("row_number", { ascending: false });
  for (const row of rows.data ?? []) {
    if (!row.club_id) continue;
    if (row.action === "insert") await context.db.from("clubs").delete().eq("id", row.club_id);
    else if (row.before_state) await context.db.from("clubs").update(row.before_state as Partial<ClubRow>).eq("id", row.club_id);
  }
  await context.db.from("club_import_batches").update({ status: "rolled_back", rolled_back_at: new Date().toISOString() }).eq("id", batchId);
  refreshDataPages();
  return { ok: true, message: "The imported Club, meeting, and Advisor changes were rolled back." };
}

export async function bulkUpdateClubs(formData: FormData) {
  const context = await admin();
  if (!context) return { ok: false, message: "Admin access required." };
  const ids = formData.getAll("club_id").map(String).filter(Boolean).slice(0, 200);
  if (!ids.length || formData.get("confirm") !== "yes") return { ok: false, message: "Select Clubs and confirm the bulk change." };
  const operation = String(formData.get("operation") ?? "");
  if (operation === "archive") await context.db.from("clubs").update({ status: "archived" }).in("id", ids);
  else if (operation === "category") await context.db.from("clubs").update({ category: String(formData.get("value") ?? "").trim() || null }).in("id", ids);
  else if (operation === "year") await context.db.from("clubs").update({ school_year: String(formData.get("value") ?? "").trim() || null }).in("id", ids);
  else if (operation === "advisor") {
    const email = String(formData.get("value") ?? "").trim().toLowerCase();
    const profile = await context.db.from("profiles").select("id,full_name,email,role").eq("email", email).maybeSingle();
    if (profile.data && ["teacher", "advisor"].includes(profile.data.role)) await context.db.from("club_advisors").upsert(ids.map((club_id) => ({ club_id, profile_id: profile.data!.id, display_name: profile.data!.full_name, contact_email: profile.data!.email })), { onConflict: "club_id,profile_id" });
    else {
      const name = email.split("@")[0].replace(/[._-]+/g, " ");
      await context.db.from("pending_club_advisors").upsert(ids.map((club_id) => ({ club_id, email, display_name: name, created_by: context.user.id })), { onConflict: "club_id,email" });
    }
  } else return { ok: false, message: "Choose a bulk operation." };
  refreshDataPages();
  return { ok: true, message: `Updated ${ids.length} Clubs.` };
}
