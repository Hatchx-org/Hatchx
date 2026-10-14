"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { announcementTags, parseOptionalIsoDateTime } from "@/lib/input-validation";
import { newYorkDateTimeToUtc } from "@/lib/calendar-date";
import { parseCsv } from "@/lib/csv";
import { normalizeAnnouncementAudience } from "@/lib/announcement-audience";
import { hasPermission, teacherPermissions } from "@/lib/permissions";

export type ActionState = { ok: boolean; message: string } | null;

function publicationTime(value: string) {
  const parsed = parseOptionalIsoDateTime(value);
  return parsed === undefined ? undefined : parsed;
}

function effectivePin(priority: string, pinnedUntil: string | null, publishAt: string | null, expiresAt: string | null) {
  if (priority !== "emergency" || pinnedUntil) return pinnedUntil;
  if (expiresAt) return expiresAt;
  const begins = publishAt ? Math.max(Date.now(), new Date(publishAt).getTime()) : Date.now();
  return new Date(begins + 24 * 60 * 60 * 1000).toISOString();
}

function audienceFromForm(formData: FormData) {
  return normalizeAnnouncementAudience({
    audienceType: String(formData.get("audience_type") ?? "school"),
    audienceGrades: formData.getAll("audience_grades").map(Number),
    audienceClubIds: formData.getAll("audience_club_ids").map(String),
  });
}

export async function saveAnnouncementDraft(input: { key: string; title: string; tag: string; body: string; publishAt: string; priority: string; pinnedUntil: string; expiresAt: string; audienceType: string; audienceGrades: number[]; audienceClubIds: string[]; notifyInApp: boolean; notifyEmail: boolean }) {
  const user = await getCurrentUser();
  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (input.key !== "new" && !/^[0-9a-f-]{36}$/i.test(input.key)) return { ok: false, message: "Invalid draft." };
  const title = input.title.trim();
  const body = input.body.trim();
  const publishAt = publicationTime(input.publishAt);
  const pinnedUntil = publicationTime(input.pinnedUntil);
  const expiresAt = publicationTime(input.expiresAt);
  const audience = normalizeAnnouncementAudience(input);
  if (title.length > 120 || body.length > 10000 || publishAt === undefined || pinnedUntil === undefined || expiresAt === undefined || !audience || !["normal","important","urgent","emergency"].includes(input.priority) || !announcementTags.includes(input.tag as (typeof announcementTags)[number])) return { ok: false, message: "Draft exceeds the allowed length or has invalid publication settings." };
  const db = await createServerClient();
  const { error } = await db.from("announcement_drafts").upsert({ user_id: user.id, draft_key: input.key, title, tag: input.tag, body, publish_at: publishAt, priority: input.priority as "normal" | "important" | "urgent" | "emergency", pinned_until: pinnedUntil, expires_at: expiresAt, ...audience, notify_in_app: input.notifyInApp, notify_email: input.notifyInApp && input.notifyEmail, updated_at: new Date().toISOString() });
  return error ? { ok: false, message: "Draft could not be saved. Apply supabase/schema.sql." } : { ok: true, message: "Draft saved." };
}

function invalid(): ActionState {
  return { ok: false, message: "Something went wrong. Try again." };
}

export async function createAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  const title = String(formData.get("title") ?? "").trim();
  const tag = String(formData.get("tag") ?? "Announcements").trim();
  const body = String(formData.get("body") ?? "").trim();
  const versionNote = String(formData.get("version_note") ?? "Initial publication").trim();
  const publishAt = publicationTime(String(formData.get("publish_at") ?? ""));
  const pinnedUntil = publicationTime(String(formData.get("pinned_until") ?? ""));
  const expiresAt = publicationTime(String(formData.get("expires_at") ?? ""));
  const priority = String(formData.get("priority") ?? "normal");
  const audience = audienceFromForm(formData);
  const notifyInApp = formData.get("notify_in_app") === "on";
  const notifyEmail = notifyInApp && formData.get("notify_email") === "on";

  if (!user || !(await hasPermission("announcements.manage"))) {
    return { ok: false, message: "Announcement permission required." };
  }
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: "Supabase is not configured. Add the env keys in .env.local to publish.",
    };
  }
  if (title.length < 3 || title.length > 120 || body.length < 3 || body.length > 10000) {
    return { ok: false, message: "Use a 3–120 character title and 3–10,000 character body." };
  }
  if (!announcementTags.includes(tag as (typeof announcementTags)[number])) return invalid();
  if (versionNote.length > 240) return { ok: false, message: "Version notes must be 240 characters or fewer." };
  if (publishAt === undefined || pinnedUntil === undefined || expiresAt === undefined || !audience || !["normal","important","urgent","emergency"].includes(priority)) return { ok: false, message: "Choose a valid audience and publication settings." };
  if (expiresAt && publishAt && expiresAt <= publishAt) return { ok: false, message: "Expiration must be after publication." };

  const supabase = await createServerClient();
  const { data: created, error } = await supabase.from("announcements").insert({
    title,
    tag,
    body,
    created_by: user.id,
    updated_by: user.id,
    version_note: versionNote.slice(0, 240) || "Initial publication",
    publish_at: publishAt,
    priority: priority as "normal" | "important" | "urgent" | "emergency",
    pinned_until: effectivePin(priority, pinnedUntil, publishAt, expiresAt),
    expires_at: expiresAt,
    ...audience,
    notify_in_app: notifyInApp,
    notify_email: notifyEmail,
    published: true,
  }).select("id").maybeSingle();

  if (error || !created) return { ok: false, message: "Could not publish. Apply supabase/schema.sql after the earlier announcement migrations." };
  if (!publishAt || new Date(publishAt).getTime() <= Date.now()) await supabase.rpc("dispatch_due_announcement_notifications", { p_announcement_id: created.id });
  await supabase.from("announcement_drafts").delete().eq("user_id", user.id).eq("draft_key", "new");

  revalidatePath("/announcements");
  revalidatePath("/");
  revalidatePath("/admin/announcements");
  return { ok: true, message: publishAt && new Date(publishAt).getTime() > Date.now() ? "Announcement scheduled." : "Announcement published." };
}

export async function deleteAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");

  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (!isSupabaseConfigured() || !id) return invalid();

  const supabase = await createServerClient();
  const { data, error } = await supabase.from("announcements").delete().eq("id", id).not("archived_at", "is", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Archive the announcement before permanently deleting it." };

  revalidatePath("/announcements");
  revalidatePath("/");
  revalidatePath("/admin/announcements");
  return { ok: true, message: "Announcement deleted." };
}

export async function archiveAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (!isSupabaseConfigured() || !id) return invalid();

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("announcements")
    .update({
      published: false,
      archived_at: new Date().toISOString(),
      updated_by: user.id,
      version_note: "Archived",
    })
    .eq("id", id);
  if (error) return invalid();

  revalidatePath("/");
  revalidatePath("/announcements");
  revalidatePath("/announcements/archive");
  revalidatePath("/admin/announcements");
  return { ok: true, message: "Announcement archived." };
}

export async function restoreAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (!isSupabaseConfigured() || !id) return invalid();
  const supabase = await createServerClient();
  const { error } = await supabase.from("announcements").update({ published: true, archived_at: null, updated_by: user.id, version_note: "Restored" }).eq("id", id);
  if (error) return invalid();
  revalidatePath("/");
  revalidatePath("/announcements");
  revalidatePath("/announcements/archive");
  revalidatePath("/admin/announcements");
  return { ok: true, message: "Announcement restored." };
}

export async function updateAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const tag = String(formData.get("tag") ?? "Announcements");
  const body = String(formData.get("body") ?? "").trim();
  const versionNote = String(formData.get("version_note") ?? "").trim();
  const publishAt = publicationTime(String(formData.get("publish_at") ?? ""));
  const pinnedUntil = publicationTime(String(formData.get("pinned_until") ?? ""));
  const expiresAt = publicationTime(String(formData.get("expires_at") ?? ""));
  const priority = String(formData.get("priority") ?? "normal");
  const audience = audienceFromForm(formData);
  const notifyInApp = formData.get("notify_in_app") === "on";
  const notifyEmail = notifyInApp && formData.get("notify_email") === "on";
  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (!isSupabaseConfigured() || !id || !audience || title.length < 3 || title.length > 120 || body.length < 3 || body.length > 10000 || !versionNote || versionNote.length > 240 || publishAt === undefined || pinnedUntil === undefined || expiresAt === undefined || !["normal","important","urgent","emergency"].includes(priority) || Boolean(expiresAt && publishAt && expiresAt <= publishAt)) return invalid();
  if (!announcementTags.includes(tag as (typeof announcementTags)[number])) return invalid();
  const supabase = await createServerClient();
  const { error } = await supabase.from("announcements").update({ title, tag, body, publish_at: publishAt, priority: priority as "normal" | "important" | "urgent" | "emergency", pinned_until: effectivePin(priority, pinnedUntil, publishAt, expiresAt), expires_at: expiresAt, ...audience, notify_in_app: notifyInApp, notify_email: notifyEmail, updated_by: user.id, version_note: versionNote.slice(0, 240) }).eq("id", id);
  if (error) return invalid();
  if (!publishAt || new Date(publishAt).getTime() <= Date.now()) await supabase.rpc("dispatch_due_announcement_notifications", { p_announcement_id: id });
  await supabase.from("announcement_drafts").delete().eq("user_id", user.id).eq("draft_key", id);
  revalidatePath(`/announcements/${id}`);
  revalidatePath(`/admin/announcements/${id}`);
  revalidatePath("/announcements");
  revalidatePath("/");
  return { ok: true, message: "Announcement updated and version saved." };
}

export async function restoreAnnouncementVersion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await hasPermission("announcements.manage"))) return { ok: false, message: "Announcement permission required." };
  if (formData.get("confirm") !== "yes") return { ok: false, message: "Confirm restoration first." };
  const id = String(formData.get("id") ?? "");
  const versionId = String(formData.get("version_id") ?? "");
  const db = await createServerClient();
  const { data: version } = await db.from("announcement_versions").select("snapshot_title,snapshot_content,snapshot_tag,version_number").eq("id", versionId).eq("announcement_id", id).maybeSingle();
  if (!version) return { ok: false, message: "Version not found." };
  const { data, error } = await db.from("announcements").update({ title: version.snapshot_title, body: version.snapshot_content, tag: version.snapshot_tag, updated_by: user.id, version_note: `Restored version ${version.version_number}` }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return invalid();
  revalidatePath(`/admin/announcements/${id}`);
  revalidatePath(`/announcements/${id}`);
  revalidatePath("/announcements");
  return { ok: true, message: `Restored version ${version.version_number}.` };
}

export async function setApplicationStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  if (!isSupabaseConfigured() || !id) return invalid();
  if (!["approved", "rejected"].includes(status)) return invalid();

  const supabase = await createServerClient();
  const nextStatus = status as "approved" | "rejected";
  const { data: application } = await supabase.from("club_applications").select("id, submitted_by, status").eq("id", id).maybeSingle();
  if (!application || application.status !== "pending") return { ok: false, message: "This pending application is no longer available." };
  if (nextStatus === "approved") {
    if (!application.submitted_by) return { ok: false, message: "Only applications submitted by a teacher can be approved." };
    const { data: applicant } = await supabase.from("profiles").select("role").eq("id", application.submitted_by).maybeSingle();
    if (applicant?.role !== "teacher") return { ok: false, message: "Only applications submitted by a teacher can be approved." };
  }
  const { error } = await supabase
    .from("club_applications")
    .update({ status: nextStatus, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", id);

  if (error) return invalid();

  revalidatePath("/admin/clubs");
  revalidatePath("/admin");
  revalidatePath("/clubs");
  return { ok: true, message: nextStatus === "approved" ? "Application approved. The Club is live and the teacher is now its Advisor." : "Application rejected." };
}

export async function updateUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  const gradeValue = String(formData.get("grade_level") ?? "");
  const gradeLevel = gradeValue ? Number(gradeValue) : null;

  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  if (!isSupabaseConfigured() || !id) return invalid();
  if (!["student", "teacher", "admin"].includes(role)) return invalid();
  if (gradeLevel !== null && ![9, 10, 11, 12].includes(gradeLevel)) return { ok: false, message: "Choose a valid grade." };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("assign_account_role", {
    p_user_id: id,
    p_role: role,
    p_club_id: null,
  });

  if (error) return invalid();
  const gradeResult = await supabase.rpc("set_profile_grade", { p_user_id: id, p_grade_level: gradeLevel });
  if (gradeResult.error) return { ok: false, message: "Role saved, but grade requires supabase/schema.sql." };

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true, message: "Role updated." };
}

export async function setTeacherPermissions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  const id = String(formData.get("id") ?? "");
  const permissions = formData.getAll("permissions").map(String);
  if (!id || permissions.some(value => !teacherPermissions.includes(value as (typeof teacherPermissions)[number]))) return invalid();
  const db = await createServerClient();
  const { error } = await db.rpc("set_teacher_permissions", { p_profile_id: id, p_permissions: permissions });
  if (error) return { ok: false, message: "Permissions could not be saved. Apply supabase/schema.sql first." };
  revalidatePath("/admin/users");
  return { ok: true, message: "Teacher permissions updated." };
}

export async function setTeacherClubs(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  const id = String(formData.get("id") ?? "");
  const clubIds = [...new Set(formData.getAll("club_ids").map(String).filter(Boolean))];
  if (!id || clubIds.some(value => !/^[0-9a-f-]{36}$/i.test(value))) return invalid();
  const db = await createServerClient();
  const { error } = await db.rpc("set_teacher_clubs", { p_profile_id: id, p_club_ids: clubIds });
  if (error) return { ok: false, message: "Club assignments could not be saved. Apply supabase/schema.sql first." };
  revalidatePath("/admin/users");
  revalidatePath("/clubs/manage");
  return { ok: true, message: clubIds.length ? clubIds.length + " Club assignment" + (clubIds.length === 1 ? "" : "s") + " saved." : "All Club assignments removed." };
}

export async function setSupportRequestStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!user || !(await hasPermission("support.manage"))) return { ok: false, message: "Support permission required." };
  if (!isSupabaseConfigured() || !id || !["open", "in_review", "resolved", "closed"].includes(status)) return invalid();
  const supabase = await createServerClient();
  const { error } = await supabase.from("support_requests").update({
    status: status as "open" | "in_review" | "resolved" | "closed",
    assigned_to: user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return invalid();
  revalidatePath("/admin/support");
  revalidatePath("/support");
  return { ok: true, message: "Request updated." };
}

const opportunityCategories = ["community_service", "internship", "pre_college", "scholarship", "discount"] as const;
const opportunityStatuses = ["draft", "in_review", "published", "expired", "archived"] as const;

export async function createOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await hasPermission("opportunities.manage"))) return { ok: false, message: "Opportunities permission required." };
  if (!isSupabaseConfigured()) return invalid();
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const eligibility = String(formData.get("eligibility") ?? "").trim();
  const applicationLink = String(formData.get("application_link") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "");
  if (title.length < 3 || title.length > 120 || description.length < 10 || description.length > 4000) return invalid();
  if (!opportunityCategories.includes(category as (typeof opportunityCategories)[number])) return invalid();
  if (applicationLink) {
    try {
      if (new URL(applicationLink).protocol !== "https:") return { ok: false, message: "Application links must use HTTPS." };
    } catch {
      return { ok: false, message: "Enter a valid application link." };
    }
  }
  const deadlineIso = parseOptionalIsoDateTime(deadline);
  if (deadlineIso === undefined) return { ok: false, message: "Enter a valid deadline." };
  const supabase = await createServerClient();
  const { error } = await supabase.from("opportunities").insert({
    title,
    category: category as (typeof opportunityCategories)[number],
    description,
    eligibility: eligibility || null,
    application_link: applicationLink || null,
    deadline: deadlineIso,
    status: "draft",
    created_by: user.id,
  });
  if (error) return invalid();
  revalidatePath("/admin/opportunities");
  return { ok: true, message: "Opportunity saved as a draft." };
}

export async function setOpportunityStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!user || !(await hasPermission("opportunities.manage"))) return { ok: false, message: "Opportunities permission required." };
  if (!id || !isSupabaseConfigured() || !opportunityStatuses.includes(status as (typeof opportunityStatuses)[number])) return invalid();
  const supabase = await createServerClient();
  const { error } = await supabase.from("opportunities").update({ status: status as (typeof opportunityStatuses)[number], updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return invalid();
  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
  revalidatePath("/");
  return { ok: true, message: "Opportunity updated." };
}

function opportunityInput(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const eligibility = String(formData.get("eligibility") ?? "").trim();
  const applicationLink = String(formData.get("application_link") ?? "").trim();
  const deadline = parseOptionalIsoDateTime(String(formData.get("deadline") ?? ""));
  if (title.length < 3 || title.length > 120 || description.length < 10 || description.length > 4000 || !opportunityCategories.includes(category as (typeof opportunityCategories)[number]) || deadline === undefined) return null;
  if (applicationLink) {
    try { if (new URL(applicationLink).protocol !== "https:") return null; } catch { return null; }
  }
  return { title, category: category as (typeof opportunityCategories)[number], description, eligibility: eligibility || null, application_link: applicationLink || null, deadline };
}

export async function updateOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const input = opportunityInput(formData);
  if (!user || !(await hasPermission("opportunities.manage"))) return { ok: false, message: "Opportunities permission required." };
  if (!id || !input || !isSupabaseConfigured()) return { ok: false, message: "Check the opportunity fields and HTTPS link." };
  const db = await createServerClient();
  const { error } = await db.from("opportunities").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return invalid();
  revalidatePath("/admin/opportunities"); revalidatePath("/opportunities", "layout"); revalidatePath("/");
  return { ok: true, message: "Opportunity content updated." };
}

export async function deleteOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!user || !(await hasPermission("opportunities.manage"))) return { ok: false, message: "Opportunities permission required." };
  if (!id || formData.get("confirm") !== "delete" || !isSupabaseConfigured()) return { ok: false, message: "Confirm deletion first." };
  const db = await createServerClient();
  const { error } = await db.from("opportunities").delete().eq("id", id);
  if (error) return invalid();
  revalidatePath("/admin/opportunities"); revalidatePath("/opportunities", "layout"); revalidatePath("/");
  return { ok: true, message: "Opportunity deleted." };
}

const eventTypes = ["school", "club", "sports", "festival", "other"] as const;

function eventInput(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const descriptionInput = String(formData.get("description") ?? "").trim();
  const description = descriptionInput || title;
  const eventType = String(formData.get("event_type") ?? "school");
  const startInput = String(formData.get("start_at") ?? "").trim();
  const endInput = String(formData.get("end_at") ?? "").trim();
  const startAt = newYorkDateTimeToUtc(startInput);
  const endAt = endInput ? newYorkDateTimeToUtc(endInput) : null;
  const location = String(formData.get("location") ?? "").trim();
  const priceLabel = String(formData.get("price_label") ?? "Free").trim();
  const calendarId = String(formData.get("calendar_id") ?? "").trim();
  const meetingEffect = String(formData.get("meeting_effect") ?? "none");
  const affectedClubId = String(formData.get("affected_club_id") ?? "").trim();
  if (title.length < 3 || title.length > 160 || description.length < 3 || description.length > 5000 || !eventTypes.includes(eventType as (typeof eventTypes)[number]) || !startAt || endAt === undefined || (endAt && endAt < startAt) || location.length > 240 || priceLabel.length > 80 || !["none","all","club"].includes(meetingEffect) || (meetingEffect === "club") !== Boolean(affectedClubId)) return null;
  return { title, description, event_type: eventType as (typeof eventTypes)[number], start_at: startAt, end_at: endAt, location: location || null, price_label: priceLabel || "Free", calendar_id: calendarId || null, meeting_effect: meetingEffect as "none" | "all" | "club", affected_club_id: affectedClubId || null, published: formData.get("published") === "on" };
}

export async function createCalendar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const color = String(formData.get("color") ?? "#263A99");
  if (name.length < 2 || name.length > 80 || description.length > 500 || !/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, message: "Check the calendar name, description, and color." };
  const db = await createServerClient();
  const { error } = await db.from("calendar_sources").insert({ name, description: description || null, color, active: true, created_by: user.id });
  if (error) return { ok: false, message: error.code === "23505" ? "A calendar with that name already exists." : "Calendar could not be created. Apply supabase/schema.sql." };
  revalidatePath("/admin/events"); revalidatePath("/announcements");
  return { ok: true, message: "Calendar created." };
}

export async function setCalendarActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  const id = String(formData.get("id") ?? "");
  const db = await createServerClient();
  const { error } = await db.from("calendar_sources").update({ active: formData.get("active") === "true", updated_at: new Date().toISOString() }).eq("id", id);
  if (error || !id) return invalid();
  revalidatePath("/admin/events"); revalidatePath("/announcements");
  return { ok: true, message: "Calendar visibility updated." };
}

export async function deleteCalendar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  if (!id || formData.get("confirm") !== "delete") return { ok: false, message: "Confirm deletion first." };
  const db = await createServerClient();
  const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("calendar_id", id);
  if ((count ?? 0) > 0) return { ok: false, message: "Move or delete this calendar’s events before deleting the calendar." };
  const { data, error } = await db.from("calendar_sources").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Calendar could not be deleted." };
  revalidatePath("/admin/events"); revalidatePath("/announcements");
  return { ok: true, message: "Empty calendar deleted." };
}

export async function importCalendarCsv(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Admins only." };
  const calendarId = String(formData.get("calendar_id") ?? "");
  const file = formData.get("csv");
  if (!calendarId || !(file instanceof File) || file.size > 1_000_000) return { ok: false, message: "Choose a calendar and a CSV file up to 1 MB." };
  const rows = parseCsv(await file.text());
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  for (const required of ["title", "start_at"]) if (!headers.includes(required)) return { ok: false, message: `Missing required column: ${required}` };
  if (!rows.length || rows.length > 500) return { ok: false, message: "Import between 1 and 500 events at once." };
  const db = await createServerClient();
  const source = await db.from("calendar_sources").select("id").eq("id", calendarId).maybeSingle();
  if (!source.data) return { ok: false, message: "Calendar not found." };
  const payload = [];
  for (let index = 0; index < rows.length; index++) {
    const record = Object.fromEntries(headers.map((key, position) => [key, rows[index][position]?.trim() ?? ""]));
    const startAt = parseOptionalIsoDateTime(record.start_at);
    const endAt = parseOptionalIsoDateTime(record.end_at ?? "");
    const eventType = record.event_type || "school";
    if (record.title.length < 3 || record.title.length > 160 || !startAt || endAt === undefined || Boolean(endAt && endAt < startAt) || !eventTypes.includes(eventType as (typeof eventTypes)[number])) return { ok: false, message: `Row ${index + 2} has an invalid title, date, or event_type.` };
    payload.push({ title: record.title, description: (record.description || record.title).slice(0, 5000), event_type: eventType as (typeof eventTypes)[number], start_at: startAt, end_at: endAt, location: (record.location || "").slice(0, 240) || null, price_label: (record.price_label || "Free").slice(0, 80), published: !["false","0","no"].includes((record.published || "true").toLowerCase()), calendar_id: calendarId, club_id: null, created_by: user.id });
  }
  const { error } = await db.from("events").insert(payload);
  if (error) return { ok: false, message: "Import failed. No events were added." };
  revalidatePath("/admin/events"); revalidatePath("/calendar", "layout"); revalidatePath("/announcements"); revalidatePath("/");
  return { ok: true, message: `${payload.length} events imported.` };
}

export async function saveEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const input = eventInput(formData);
  if (!user || !(await hasPermission("events.manage"))) return { ok: false, message: "Events permission required." };
  if (input?.meeting_effect !== "none" && user.role !== "admin") return { ok: false, message: "Only administrators can cancel Club meetings." };
  if (!input || !isSupabaseConfigured()) return { ok: false, message: "Check the title, dates, and field lengths." };
  const db = await createServerClient();
  const result = id
    ? await db.from("events").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id)
    : await db.from("events").insert({ ...input, club_id: null, created_by: user.id });
  if (result.error) return { ok: false, message: result.error.code === "42703" || result.error.code === "23514" ? "Apply supabase/schema.sql, then check the meeting impact fields." : "Event could not be saved." };
  revalidatePath("/admin/events"); revalidatePath("/calendar", "layout"); revalidatePath("/");
  return { ok: true, message: id ? "Event updated." : "Event created." };
}

export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!user || !(await hasPermission("events.manage"))) return { ok: false, message: "Events permission required." };
  if (!id || formData.get("confirm") !== "delete" || !isSupabaseConfigured()) return { ok: false, message: "Confirm deletion first." };
  const db = await createServerClient();
  let query = db.from("events").delete().eq("id", id);
  if (user.role !== "admin") query = query.is("club_id", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { ok: false, message: user.role === "admin" ? "Event could not be deleted." : "Only administrators can delete Club-owned events." };
  revalidatePath("/admin/events"); revalidatePath("/calendar", "layout"); revalidatePath("/");
  return { ok: true, message: "Event deleted." };
}
