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


export async function applyClubImport(formData: FormData) {
  const context = await admin();
  if (!context) {
    return { ok: false, message: "Admin access required." };
  }

  const batchId = String(formData.get("batch_id") ?? "");

  const batch = await context.db
    .from("club_import_batches")
    .select("*")
    .eq("id", batchId)
    .eq("status", "preview")
    .maybeSingle();

  if (!batch.data || batch.data.error_rows > 0) {
    return {
      ok: false,
      message: "Resolve blocking errors first. Notes are allowed.",
    };
  }

  const rows = await context.db
    .from("club_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number");

  if (rows.error) {
    return { ok: false, message: rows.error.message };
  }

  async function stopAt(rowNumber: number, reason: string) {
    await context!.db
      .from("club_import_batches")
      .update({ status: "failed" })
      .eq("id", batchId);

    return {
      ok: false,
      message:
        `Import failed at row ${rowNumber}: ${reason}. ` +
        "Earlier rows may have been saved.",
    };
  }

  let count = 0;

  for (const row of rows.data ?? []) {
    const payload = row.payload as ClubRosterPayload;
    const meetings = clubRosterMeetings(payload);

    const existing = await context.db
      .from("clubs")
      .select("*")
      .eq("slug", payload.slug)
      .maybeSingle();

    if (existing.error) {
      return stopAt(row.row_number, existing.error.message);
    }

    const clubValues: Partial<ClubRow> = existing.data
      ? {
          slug: payload.slug,
          name: payload.club,
          category: payload.category ||
            existing.data.category || null,
          school_year: payload.school_year ||
            existing.data.school_year || null,
          status: payload.status as
            "draft" | "published" | "archived",
        }
      : {
          slug: payload.slug,
          name: payload.club,
          short_description:
            payload.description ||
            "Club information imported by administration.",
          category: payload.category || null,
          school_year: payload.school_year || null,
          status: payload.status as
            "draft" | "published" | "archived",
          created_by: context.user.id,
        };

    const saved = existing.data
      ? await context.db
          .from("clubs")
          .update(clubValues)
          .eq("id", existing.data.id)
          .select("id")
          .maybeSingle()
      : await context.db
          .from("clubs")
          .insert(clubValues)
          .select("id")
          .maybeSingle();

    if (!saved.data) {
      return stopAt(
        row.row_number,
        saved.error?.message ?? "Club could not be saved"
      );
    }

    const clubId = saved.data.id;

    const tracked = await context.db
      .from("club_import_rows")
      .update({
        before_state: existing.data as Record<string, unknown> | null,
        club_id: clubId,
        action: existing.data ? "update" : "insert",
      })
      .eq("id", row.id);

    if (tracked.error) {
      return stopAt(row.row_number, tracked.error.message);
    }

    // Optional meetings: no schedule is also acceptable.
    for (const meeting of meetings) {
      let query = context.db
        .from("club_meetings")
        .select("id")
        .eq("club_id", clubId)
        .eq("day_of_week", meeting.day_of_week);

      query = meeting.start_time
        ? query.eq("start_time", meeting.start_time)
        : query.is("start_time", null);

      query = meeting.location
        ? query.eq("location", meeting.location)
        : query.is("location", null);

      query = meeting.recurrence_note
        ? query.eq("recurrence_note", meeting.recurrence_note)
        : query.is("recurrence_note", null);

      const existingMeeting = await query.limit(1).maybeSingle();

      if (existingMeeting.error) {
        return stopAt(row.row_number, existingMeeting.error.message);
      }

      if (!existingMeeting.data) {
        const inserted = await context.db
          .from("club_meetings")
          .insert({ club_id: clubId, ...meeting })
          .select("id")
          .maybeSingle();

        if (!inserted.data) {
          return stopAt(
            row.row_number,
            inserted.error?.message ?? "Meeting could not be saved"
          );
        }

        const logged = await logRelatedRecord(
          context.db,
          batchId,
          row.id,
          "meeting",
          inserted.data.id
        );

        if (logged.error) {
          return stopAt(row.row_number, logged.error.message);
        }
      }
    }

    // Invalid emails are ignored for account claiming,
    // not treated as failures for the Club.
    const email = payload.advisor_email;

    if (validAdvisorEmail(email)) {
      const profile = await context.db
        .from("profiles")
        .select("id,full_name,email,role")
        .eq("email", email)
        .maybeSingle();

      if (profile.error) {
        return stopAt(row.row_number, profile.error.message);
      }

      const advisorName = (
        payload.advisor ||
        profile.data?.full_name ||
        email.split("@")[0]
      ).slice(0, 120);

      if (advisorName.trim().length >= 2) {
        if (
          profile.data &&
          ["teacher", "advisor"].includes(profile.data.role)
        ) {
          const oldAdvisor = await context.db
            .from("club_advisors")
            .select("id")
            .eq("club_id", clubId)
            .eq("profile_id", profile.data.id)
            .maybeSingle();

          if (oldAdvisor.error) {
            return stopAt(row.row_number, oldAdvisor.error.message);
          }

          const advisor = await context.db
            .from("club_advisors")
            .upsert({
              club_id: clubId,
              profile_id: profile.data.id,
              display_name: advisorName,
              contact_email: email,
            }, { onConflict: "club_id,profile_id" })
            .select("id")
            .maybeSingle();

          if (!advisor.data) {
            return stopAt(
              row.row_number,
              advisor.error?.message ?? "Advisor could not be saved"
            );
          }

          if (!oldAdvisor.data) {
            const logged = await logRelatedRecord(
              context.db,
              batchId,
              row.id,
              "advisor",
              advisor.data.id
            );
            if (logged.error) {
              return stopAt(row.row_number, logged.error.message);
            }
          }
        } else {
          const oldPending = await context.db
            .from("pending_club_advisors")
            .select("id")
            .eq("club_id", clubId)
            .eq("email", email)
            .maybeSingle();

          if (oldPending.error) {
            return stopAt(row.row_number, oldPending.error.message);
          }

          const pending = await context.db
            .from("pending_club_advisors")
            .upsert({
              club_id: clubId,
              email,
              display_name: advisorName,
              created_by: context.user.id,
            }, { onConflict: "club_id,email" })
            .select("id")
            .maybeSingle();

          if (!pending.data) {
            return stopAt(
              row.row_number,
              pending.error?.message ?? "Pending Advisor could not be saved"
            );
          }

          if (!oldPending.data) {
            const logged = await logRelatedRecord(
              context.db,
              batchId,
              row.id,
              "pending_advisor",
              pending.data.id
            );
            if (logged.error) {
              return stopAt(row.row_number, logged.error.message);
            }
          }
        }
      }
    }

    count += 1;
  }

  const completed = await context.db
    .from("club_import_batches")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (completed.error) {
    return { ok: false, message: completed.error.message };
  }

  refreshDataPages();

  return {
    ok: true,
    message: `Imported ${count} CSV rows successfully.`,
  };
}

