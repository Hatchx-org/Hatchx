"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import {
  CLUB_ROSTER_REQUIRED_HEADERS,
  clubRosterMeetings,
  normalizeClubRosterHeaders,
  parseClubRosterRow,
  validAdvisorEmail,
  type ClubRosterPayload,
} from "@/lib/club-roster-import";
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
  if (!context) {
    return { ok: false, message: "Admin access required." };
  }

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size > 1_000_000) {
    return { ok: false, message: "Choose a CSV up to 1 MB." };
  }

  const parsed = parseCsv(await file.text());
  const headers = normalizeClubRosterHeaders(parsed.shift() ?? []);

  const missing = CLUB_ROSTER_REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    return {
      ok: false,
      message: `Missing required column: ${missing.join(", ")}`,
    };
  }

  if (!parsed.length || parsed.length > 500) {
    return {
      ok: false,
      message: "CSV must contain 1–500 rows.",
    };
  }

  const preview = parsed.map((values, index) => ({
    row_number: index + 2,
    ...parseClubRosterRow(headers, values),
  }));

  const validRows = preview.filter(
    (row) => row.errors.length === 0
  ).length;

  const errorRows = preview.length - validRows;
  const warningRows = preview.filter(
    (row) => row.warnings.length > 0
  ).length;

  const batch = await context.db
    .from("club_import_batches")
    .insert({
      created_by: context.user.id,
      file_name: file.name,
      total_rows: preview.length,
      valid_rows: validRows,
      error_rows: errorRows,
      status: "preview",
    })
    .select("id")
    .maybeSingle();

  if (!batch.data) {
    return {
      ok: false,
      message: batch.error?.message ?? "Failed to create preview.",
    };
  }

  const savedRows = await context.db
    .from("club_import_rows")
    .insert(
      preview.map((row) => ({
        batch_id: batch.data!.id,
        row_number: row.row_number,
        payload: {
          ...row.payload,
          _import_warnings: row.warnings,
        },
        errors: row.errors,
      }))
    );

  if (savedRows.error) {
    return {
      ok: false,
      message: savedRows.error.message,
    };
  }

  revalidatePath("/admin/data");

  return {
    ok: true,
    message:
      `Preview ready: ${validRows} importable, ` +
      `${warningRows} with notes, ` +
      `${errorRows} blocking errors.`,
  };
}
