
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
  return user?.role === "admin"
    ? { user, db: await createServerClient() }
    : null;
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
    return {
      ok: false,
      message: "Choose a CSV file up to 1 MB.",
    };
  }

  const parsed = parseCsv(await file.text());
  const headers = normalizeClubRosterHeaders(parsed.shift() ?? []);

  const missing = CLUB_ROSTER_REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    return {
      ok: false,
      message: `Missing required columns: ${missing.join(", ")}. The other columns are optional.`,
    };
  }

  if (!parsed.length) {
    return {
      ok: false,
      message: "The CSV does not contain any Club rows.",
    };
  }

  if (parsed.length > 500) {
    return {
      ok: false,
      message: "Import at most 500 rows at once.",
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
      message: "CSV preview could not be created. Confirm the Club import tables are installed.",
    };
  }

  // Store non-blocking warnings inside the JSONB payload.
  // No database migration is required.
  const savedRows = await context.db
    .from("club_import_rows")
    .insert(
      preview.map((row) => ({
        row_number: row.row_number,
        payload: {
          ...row.payload,
          _import_warnings: row.warnings,
        },
        errors: row.errors,
        batch_id: batch.data!.id,
      }))
    );

  if (savedRows.error) {
    return {
      ok: false,
      message: `The CSV preview could not be saved: ${savedRows.error.message}`,
    };
  }

  revalidatePath("/admin/data");

  return {
    ok: true,
    message:
      `Preview ready: ${validRows} importable, ` +
      `${warningRows} with non-blocking notes, ` +
      `${errorRows} blocking errors. ` +
      "Nothing has been imported yet.",
  };
}

type DatabaseClient = Awaited<
  ReturnType<typeof createServerClient>
>;

async function logRelatedRecord(
  db: DatabaseClient,
  batchId: string,
  rowId: number,
  entityType: "meeting" | "advisor" | "pending_advisor",
  entityId: string
) {
  return db.from("club_import_related_records").insert({
    batch_id: batchId,
    import_row_id: rowId,
    entity_type: entityType,
    entity_id: entityId,
  });
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
      message:
        "Resolve blocking preview errors before importing. Warnings are allowed.",
    };
  }

  const rows = await context.db
    .from("club_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number");

  if (rows.error) {
    return {
      ok: false,
      message: "Import rows could not be loaded.",
    };
  }

  async function stopAt(
    rowNumber: number,
    reason: string
  ) {
    await context!.db
      .from("club_import_batches")
      .update({ status: "failed" })
      .eq("id", batchId);

    return {
      ok: false,
      message:
        `Import stopped at CSV row ${rowNumber}: ${reason}. ` +
        "Earlier rows may have been applied and can be rolled back.",
    };
  }

  let count = 0;

  for (const row of rows.data ?? []) {
    const payload = row.payload as unknown as ClubRosterPayload;

    // Invalid or irregular schedules do NOT block Club creation.
    const meetings = clubRosterMeetings(payload);

    const existing = await context.db
      .from("clubs")
      .select("*")
      .eq("slug", payload.slug)
      .maybeSingle();

    if (existing.error) {
      return stopAt(
        row.row_number,
        existing.error.message
      );
    }

    const clubValues: Partial<ClubRow> = existing.data
      ? {
          slug: payload.slug,
          name: payload.club,
          category:
            payload.category ||
            existing.data.category ||
            null,
          school_year:
            payload.school_year ||
            existing.data.school_year ||
            null,
          status: payload.status as
            | "draft"
            | "published"
            | "archived",
        }
      : {
          slug: payload.slug,
          name: payload.club,
          short_description:
            payload.description ||
            "Club information imported by the school administration.",
          category: payload.category || null,
          school_year: payload.school_year || null,
          status: payload.status as
            | "draft"
            | "published"
            | "archived",
          created_by: context.user.id,
        };

    // Use UPDATE for existing Clubs.
    // An INSERT-style upsert could violate NOT NULL constraints.
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
        saved.error?.message ?? "Failed to save Club"
      );
    }

    const clubId = saved.data.id;

    const tracked = await context.db
      .from("club_import_rows")
      .update({
        before_state: existing.data as
          | Record<string, unknown>
          | null,
        club_id: clubId,
        action: existing.data ? "update" : "insert",
      })
      .eq("id", row.id);

    if (tracked.error) {
      return stopAt(
        row.row_number,
        tracked.error.message
      );
    }

    // Create meetings only when the DAY can be recognized.
    // Custom periods can have NULL start/end times.
    for (const meeting of meetings) {
      let meetingQuery = context.db
        .from("club_meetings")
        .select("id")
        .eq("club_id", clubId)
        .eq("day_of_week", meeting.day_of_week);

      meetingQuery = meeting.start_time
        ? meetingQuery.eq(
            "start_time",
            meeting.start_time
          )
        : meetingQuery.is("start_time", null);

      meetingQuery = meeting.location
        ? meetingQuery.eq("location", meeting.location)
        : meetingQuery.is("location", null);

      meetingQuery = meeting.recurrence_note
        ? meetingQuery.eq(
            "recurrence_note",
            meeting.recurrence_note
          )
        : meetingQuery.is("recurrence_note", null);

      const existingMeeting = await meetingQuery
        .limit(1)
        .maybeSingle();

      if (existingMeeting.error) {
        return stopAt(
          row.row_number,
          existingMeeting.error.message
        );
      }

      if (!existingMeeting.data) {
        const inserted = await context.db
          .from("club_meetings")
          .insert({
            club_id: clubId,
            ...meeting,
          })
          .select("id")
          .maybeSingle();

        if (!inserted.data) {
          return stopAt(
            row.row_number,
            inserted.error?.message ??
              "Failed to save Club meeting"
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
          return stopAt(
            row.row_number,
            logged.error.message
          );
        }
      }
    }

    // A missing/invalid Advisor email never blocks the Club.
    // Do not associate an account with an invalid address.
    const email = payload.advisor_email;

    if (validAdvisorEmail(email)) {
      const profile = await context.db
        .from("profiles")
        .select("id,full_name,email,role")
        .eq("email", email)
        .maybeSingle();

      if (profile.error) {
        return stopAt(
          row.row_number,
          profile.error.message
        );
      }

      const advisorName = (
        payload.advisor ||
        profile.data?.full_name ||
        email.split("@")[0]
      ).slice(0, 120);

      if (advisorName.trim().length >= 2) {
        if (
          profile.data &&
          ["teacher", "advisor"].includes(
            profile.data.role
          )
        ) {
          const existingAdvisor = await context.db
            .from("club_advisors")
            .select("id")
            .eq("club_id", clubId)
            .eq("profile_id", profile.data.id)
            .maybeSingle();

          if (existingAdvisor.error) {
            return stopAt(
              row.row_number,
              existingAdvisor.error.message
            );
          }

          const advisor = await context.db
            .from("club_advisors")
            .upsert(
              {
                club_id: clubId,
                profile_id: profile.data.id,
                display_name: advisorName,
                contact_email: email,
              },
              {
                onConflict: "club_id,profile_id",
              }
            )
            .select("id")
            .maybeSingle();

          if (!advisor.data) {
            return stopAt(
              row.row_number,
              advisor.error?.message ??
                "Failed to assign Advisor"
            );
          }

          if (!existingAdvisor.data) {
            const logged = await logRelatedRecord(
              context.db,
              batchId,
              row.id,
              "advisor",
              advisor.data.id
            );

            if (logged.error) {
              return stopAt(
                row.row_number,
                logged.error.message
              );
            }
          }
        } else {
          const existingPending = await context.db
            .from("pending_club_advisors")
            .select("id")
            .eq("club_id", clubId)
            .eq("email", email)
            .maybeSingle();

          if (existingPending.error) {
            return stopAt(
              row.row_number,
              existingPending.error.message
            );
          }

          const pending = await context.db
            .from("pending_club_advisors")
            .upsert(
              {
                club_id: clubId,
                email,
                display_name: advisorName,
                created_by: context.user.id,
              },
              {
                onConflict: "club_id,email",
              }
            )
            .select("id")
            .maybeSingle();

          if (!pending.data) {
            return stopAt(
              row.row_number,
              pending.error?.message ??
                "Failed to save pending Advisor"
            );
          }

          if (!existingPending.data) {
            const logged = await logRelatedRecord(
              context.db,
              batchId,
              row.id,
              "pending_advisor",
              pending.data.id
            );

            if (logged.error) {
              return stopAt(
                row.row_number,
                logged.error.message
              );
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
    return {
      ok: false,
      message: completed.error.message,
    };
  }

  refreshDataPages();

  return {
    ok: true,
    message:
      `Imported ${count} CSV rows. ` +
      "Non-standard schedule and email values were kept " +
      "in the import record rather than blocking Clubs.",
  };
}

export async function rollbackClubImport(
  formData: FormData
) {
  const context = await admin();

  if (!context) {
    return {
      ok: false,
      message: "Admin access required.",
    };
  }

  const batchId = String(
    formData.get("batch_id") ?? ""
  );

  const batch = await context.db
    .from("club_import_batches")
    .select("id")
    .eq("id", batchId)
    .in("status", ["applied", "failed"])
    .maybeSingle();

  if (!batch.data) {
    return {
      ok: false,
      message:
        "Only applied or failed batches can be rolled back.",
    };
  }

  const related = await context.db
    .from("club_import_related_records")
    .select("*")
    .eq("batch_id", batchId)
    .order("id", { ascending: false });

  for (const record of related.data ?? []) {
    if (record.entity_type === "meeting") {
      await context.db
        .from("club_meetings")
        .delete()
        .eq("id", record.entity_id);
    }

    if (record.entity_type === "advisor") {
      await context.db
        .from("club_advisors")
        .delete()
        .eq("id", record.entity_id);
    }

    if (record.entity_type === "pending_advisor") {
      const pending = await context.db
        .from("pending_club_advisors")
        .select("club_id,claimed_profile_id")
        .eq("id", record.entity_id)
        .maybeSingle();

      if (pending.data?.claimed_profile_id) {
        await context.db
          .from("club_advisors")
          .delete()
          .eq("club_id", pending.data.club_id)
          .eq(
            "profile_id",
            pending.data.claimed_profile_id
          );
      }

      await context.db
        .from("pending_club_advisors")
        .delete()
        .eq("id", record.entity_id);
    }
  }

  const rows = await context.db
    .from("club_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number", { ascending: false });

  for (const row of rows.data ?? []) {
    if (!row.club_id) continue;

    if (row.action === "insert") {
      await context.db
        .from("clubs")
        .delete()
        .eq("id", row.club_id);
    } else if (row.before_state) {
      await context.db
        .from("clubs")
        .update(
          row.before_state as Partial<ClubRow>
        )
        .eq("id", row.club_id);
    }
  }

  await context.db
    .from("club_import_batches")
    .update({
      status: "rolled_back",
      rolled_back_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  refreshDataPages();

  return {
    ok: true,
    message:
      "The imported Club, meeting, and Advisor changes were rolled back.",
  };
}

export async function bulkUpdateClubs(
  formData: FormData
) {
  const context = await admin();

  if (!context) {
    return {
      ok: false,
      message: "Admin access required.",
    };
  }

  const ids = formData
    .getAll("club_id")
    .map(String)
    .filter(Boolean)
    .slice(0, 200);

  if (
    !ids.length ||
    formData.get("confirm") !== "yes"
  ) {
    return {
      ok: false,
      message:
        "Select Clubs and confirm the bulk change.",
    };
  }

  const operation = String(
    formData.get("operation") ?? ""
  );

  if (operation === "archive") {
    await context.db
      .from("clubs")
      .update({ status: "archived" })
      .in("id", ids);
  } else if (operation === "category") {
    await context.db
      .from("clubs")
      .update({
        category:
          String(formData.get("value") ?? "").trim() ||
          null,
      })
      .in("id", ids);
  } else if (operation === "year") {
    await context.db
      .from("clubs")
      .update({
        school_year:
          String(formData.get("value") ?? "").trim() ||
          null,
      })
      .in("id", ids);
  } else if (operation === "advisor") {
    const email = String(
      formData.get("value") ?? ""
    )
      .trim()
      .toLowerCase();

    if (!validAdvisorEmail(email)) {
      return {
        ok: false,
        message:
          "Enter a valid Advisor email for bulk assignment.",
      };
    }

    const profile = await context.db
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("email", email)
      .maybeSingle();

    if (profile.error) {
      return {
        ok: false,
        message: profile.error.message,
      };
    }

    if (
      profile.data &&
      ["teacher", "advisor"].includes(
        profile.data.role
      )
    ) {
      const { error } = await context.db
        .from("club_advisors")
        .upsert(
          ids.map((club_id) => ({
            club_id,
            profile_id: profile.data!.id,
            display_name:
              profile.data!.full_name,
            contact_email: profile.data!.email,
          })),
          {
            onConflict: "club_id,profile_id",
          }
        );

      if (error) {
        return {
          ok: false,
          message: error.message,
        };
      }
    } else {
      const name = email
        .split("@")[0]
        .replace(/[._-]+/g, " ");

      if (name.trim().length < 2) {
        return {
          ok: false,
          message:
            "Advisor name inferred from email is too short.",
        };
      }

      const { error } = await context.db
        .from("pending_club_advisors")
        .upsert(
          ids.map((club_id) => ({
            club_id,
            email,
            display_name: name.slice(0, 120),
            created_by: context.user.id,
          })),
          {
            onConflict: "club_id,email",
          }
        );

      if (error) {
        return {
          ok: false,
          message: error.message,
        };
      }
    }
  } else {
    return {
      ok: false,
      message: "Choose a bulk operation.",
    };
  }

  refreshDataPages();

  return {
    ok: true,
    message: `Updated ${ids.length} Clubs.`,
  };
}
