"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { parseOptionalDateOnly, parseOptionalIsoDateTime } from "@/lib/input-validation";
import { parseMeetingInput, parseClubPostInput } from "@/lib/club-content-input";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";
import { parseClubShareLinkInput } from "@/lib/club-share-link";
import { attendanceExpiresAt, isAttendanceStartAllowed, isTemporaryAttendanceDuration } from "@/lib/attendance-session";
import { parseClubProfileInput } from "@/lib/club-profile-input";
import { isClubMediaPermission, isMeaningfulAltText } from "@/lib/club-media";
import { generateClubInviteCode } from "@/lib/club-invite-code";
import { isStudentEmail } from "@/lib/student-registration";
import { buildClubInvitationEmail, deliverClubInvitationEmail } from "@/lib/club-invitation-email";
import { isHexColor } from "@/lib/club-appearance";
import { isAllowedEmail } from "@/lib/email-access";

const denied = { ok: false, message: "You no longer have permission for this club. Refresh or contact your advisor." };
const invalid = { ok: false, message: "Check the required fields, lengths and dates, then try again." };
const failed = { ok: false, message: "Nothing was saved. Check your permissions and database setup, then try again." };
const saved = { ok: true, message: "Saved successfully." };
function missingMediaProcessingSchema(error: { code?: string; message?: string } | null) {
  return Boolean(error && (["42703", "PGRST204"].includes(error.code ?? "") || /medium_path|permission_basis|thumbnail_path/i.test(error.message ?? "")));
}
function mediaUploadErrorMessage(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (/bucket.*not found|not found.*bucket/i.test(message)) return "Media storage is not configured. Apply supabase/schema.sql, then try again.";
  if (/row-level security|unauthorized|permission/i.test(message)) return "Your Club media storage permission is missing. Apply the latest supabase/schema.sql policies, then sign in again.";
  if (/payload|too large|maximum/i.test(message)) return "The optimized photo is still too large for storage. Crop closer or choose a smaller image.";
  return "Image upload failed. Check the Club media Storage bucket and policies, then try again.";
}

/** Publication is a staff decision; club editors retain ordinary content access. */
export async function updateClubPublication(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !["staff", "admin"].includes(context.user.role)) return denied;
  const status = String(formData.get("status") ?? "");
  if (!["draft", "published", "archived"].includes(status)) return invalid;
  const { data, error } = await context.supabase.from("clubs").update({ status: status as "draft" | "published" | "archived" }).eq("id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath("/clubs", "layout");
  return { ok: true, message: `Club status changed to ${status}.` };
}

/**
 * Resolves club-scoped authorization for every management mutation.
 * Officers can maintain content; advisors and staff also receive governance
 * powers. PostgreSQL RLS repeats this check as the final security boundary.
 */
async function managerContext(clubId: string) {
  const user = await getCurrentUser();
  if (!user || !clubId || !isSupabaseConfigured()) return null;
  const supabase = await createServerClient();
  if (["staff", "admin"].includes(user.role)) return { user, supabase, canGovern: true };
  const [manage, govern] = await Promise.all([
    supabase.rpc("can_manage_club", { p_club_id: clubId }),
    supabase.rpc("can_govern_club", { p_club_id: clubId }),
  ]);
  if (manage.data) return { user, supabase, canGovern: govern.data === true };
  return null;
}

export async function updateManagedClub(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const profile = parseClubProfileInput(formData);
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  if (!profile) return { ok: false, message: "Add a short and full introduction, 1–3 unique tags, and a valid weekly commitment." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return invalid;
  const activeStartDate = parseOptionalDateOnly(String(formData.get("active_start_date") ?? ""));
  const activeEndDate = parseOptionalDateOnly(String(formData.get("active_end_date") ?? ""));
  if (activeStartDate === undefined || activeEndDate === undefined) return invalid;
  if (activeStartDate && activeEndDate && activeEndDate < activeStartDate) return invalid;
  const { data, error } = await context.supabase.from("clubs").update({
    short_description: profile.shortDescription,
    full_description: profile.fullDescription,
    mission: profile.mission,
    activities: profile.activities,
    who_should_join: profile.whoShouldJoin,
    membership_expectations: profile.membershipExpectations,
    weekly_commitment_hours: profile.weeklyCommitmentHours,
    interest_tags: profile.tags,
    is_stem: formData.get("is_stem") === "on",
    is_community_service: formData.get("is_community_service") === "on",
    active_start_date: activeStartDate,
    active_end_date: activeEndDate,
    contact_email: contactEmail || null,
    join_policy: formData.get("join_policy") === "instant" ? "instant" : "approval_required",
    recruiting_status: ["recruiting", "paused", "closed"].includes(String(formData.get("recruiting_status"))) ? formData.get("recruiting_status") as "recruiting" | "paused" | "closed" : "recruiting",
  }).eq("id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/${slug}`);
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs");
  revalidatePath("/clubs/quiz");
  revalidatePath("/search");
  return saved;
}

export async function updateClubAppearance(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const background = String(formData.get("profile_background_color") ?? "").toLowerCase();
  const accent = String(formData.get("profile_accent_color") ?? "").toLowerCase();
  if (!isHexColor(background) || !isHexColor(accent)) return { ok: false, message: "Choose two valid colors." };
  const { data, error } = await context.supabase.from("clubs").update({ profile_background_color: background, profile_accent_color: accent }).eq("id", clubId).select("slug").maybeSingle();
  if (error || !data) return { ok: false, message: "Background could not be saved. Apply supabase/schema.sql first." };
  revalidatePath(`/clubs/${data.slug}`);
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "Club profile background updated." };
}

export async function addClubMeeting(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const meeting = parseMeetingInput(formData);
  if (!meeting) return invalid;
  const { error } = await context.supabase.from("club_meetings").insert({
    club_id: clubId,
    ...meeting,
  });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/calendar");
  revalidatePath("/clubs", "layout");
  return saved;
}

function randomAttendanceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createAttendanceSession(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const label = String(formData.get("label") ?? "").trim();
  const codeType = formData.get("code_type") === "permanent" ? "permanent" : "temporary";
  const duration = Number(formData.get("duration_minutes"));
  const requestedStart = parseOptionalIsoDateTime(String(formData.get("starts_at") ?? ""));
  if (label.length < 3 || label.length > 120) return invalid;
  if (requestedStart === undefined || (codeType === "temporary" && !isTemporaryAttendanceDuration(duration))) return invalid;

  const now = Date.now();
  const startsAt = requestedStart ?? new Date(now).toISOString();
  const startsAtTime = new Date(startsAt).getTime();
  if (!isAttendanceStartAllowed(startsAtTime, now)) return { ok: false, message: "Choose a start time between now and one year from now." };
  const expiresAt = codeType === "temporary"
    ? attendanceExpiresAt(startsAtTime, duration)
    : null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = randomAttendanceCode();
    const { error } = await context.supabase.from("club_attendance_sessions").insert({
      club_id: clubId,
      label,
      code,
      code_type: codeType,
      starts_at: startsAt,
      expires_at: expiresAt,
      created_by: context.user.id,
    });
    if (!error) {
      revalidatePath(`/clubs/manage/${clubId}`);
      return { ok: true, message: `${startsAtTime > now + 60_000 ? "Scheduled" : codeType === "temporary" ? "Temporary" : "Permanent"} check-in code created.` };
    }
    if (["42703", "PGRST204"].includes(error.code)) return { ok: false, message: "Scheduled attendance requires supabase/schema.sql." };
    if (error.code !== "23505") return failed;
  }
  return { ok: false, message: "A unique code could not be generated. Please try again." };
}

export async function closeAttendanceSession(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !sessionId) return denied;
  const { data, error } = await context.supabase.from("club_attendance_sessions")
    .update({ active: false })
    .eq("id", sessionId)
    .eq("club_id", clubId)
    .select("id")
    .maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "Check-in closed. The code can no longer be used." };
}

export async function createClubShareLink(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const input = parseClubShareLinkInput(String(formData.get("label") ?? ""), String(formData.get("expires_at") ?? ""));
  if (!input) return { ok: false, message: "Enter a label and an expiration between 5 minutes and 366 days from now." };
  const { data: club } = await context.supabase.from("clubs").select("status").eq("id", clubId).maybeSingle();
  if (club?.status !== "published") return { ok: false, message: "Publish this Club before creating a public fair QR code." };
  const { error } = await context.supabase.from("club_share_links").insert({
    club_id: clubId,
    label: input.label,
    expires_at: input.expiresAt,
    active: true,
    created_by: context.user.id,
  });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "Club fair QR code created." };
}

export async function revokeClubShareLink(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const linkId = String(formData.get("link_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !linkId) return denied;
  const { data, error } = await context.supabase.from("club_share_links").update({ active: false })
    .eq("id", linkId).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "QR link revoked. Existing printed codes will no longer open the Club." };
}

export async function createClubInviteCode(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const label = String(formData.get("label") ?? "").trim();
  const maxUsesValue = String(formData.get("max_uses") ?? "").trim();
  const maxUses = maxUsesValue ? Number(maxUsesValue) : null;
  const expiresValue = String(formData.get("expires_at") ?? "").trim();
  const expiresAt = expiresValue ? new Date(expiresValue) : null;
  if (label.length < 3 || label.length > 100 || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) || (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 5 * 60_000))) return invalid;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await context.supabase.from("club_invite_codes").insert({ club_id: clubId, code: generateClubInviteCode(), label, expires_at: expiresAt?.toISOString() ?? null, max_uses: maxUses, created_by: context.user.id });
    if (!error) { revalidatePath(`/clubs/manage/${clubId}`); return { ok: true, message: "Registration invite code created." }; }
    if (["42P01", "PGRST205"].includes(error.code)) return { ok: false, message: "Apply supabase/schema.sql before creating invite codes." };
    if (error.code !== "23505") return failed;
  }
  return { ok: false, message: "A unique invite code could not be generated. Try again." };
}

export async function revokeClubInviteCode(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const inviteId = String(formData.get("invite_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !inviteId) return denied;
  const { data, error } = await context.supabase.from("club_invite_codes").update({ active: false }).eq("id", inviteId).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "Invite code revoked." };
}

export async function inviteStudentToClub(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !context.canGovern) return denied;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const personalMessage = String(formData.get("personal_message") ?? "").trim();
  if (!isStudentEmail(email) || personalMessage.length > 500) return { ok: false, message: "Enter a valid @nycstudents.net email and keep the message under 500 characters." };

  const [{ data: club }, { data: links }, { data: meetings }] = await Promise.all([
    context.supabase.from("clubs").select("id,slug,name,short_description").eq("id", clubId).maybeSingle(),
    context.supabase.from("club_links").select("*").eq("club_id", clubId).order("sort_order"),
    context.supabase.from("club_meetings").select("*").eq("club_id", clubId).order("day_of_week"),
  ]);
  if (!club) return failed;

  const existing = await context.supabase.from("club_member_invitations").select("id").eq("club_id", clubId).eq("email", email).eq("status", "pending").maybeSingle();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const invitation = existing.data
    ? await context.supabase.from("club_member_invitations").update({ personal_message: personalMessage || null, expires_at: expiresAt, invited_by: context.user.id }).eq("id", existing.data.id).select("id").maybeSingle()
    : await context.supabase.from("club_member_invitations").insert({ club_id: clubId, email, personal_message: personalMessage || null, invited_by: context.user.id, expires_at: expiresAt }).select("id").maybeSingle();
  if (!invitation.data) return { ok: false, message: "Apply supabase/schema.sql before sending student invitations." };

  const profile = await context.supabase.from("profiles").select("id,role").eq("email", email).maybeSingle();
  if (profile.data?.role === "student") {
    await context.supabase.from("club_memberships").upsert({ club_id: clubId, profile_id: profile.data.id, status: "active", reviewed_at: new Date().toISOString() }, { onConflict: "club_id,profile_id" });
    await context.supabase.from("club_member_invitations").update({ status: "accepted", claimed_profile_id: profile.data.id, claimed_at: new Date().toISOString() }).eq("id", invitation.data.id);
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const content = buildClubInvitationEmail({ clubName: club.name, description: club.short_description, clubUrl: `${origin}/login?next=${encodeURIComponent(`/clubs/${club.slug}`)}`, personalMessage, links: links ?? [], meetings: meetings ?? [] });
  const queued = await context.supabase.from("club_invitation_email_outbox").insert({ invitation_id: invitation.data.id, to_email: email, subject: content.subject, html_body: content.html, text_body: content.text }).select("id,to_email,subject,html_body,text_body").maybeSingle();
  if (!queued.data) return { ok: true, message: "The student invitation was saved, but the introduction email could not be queued." };
  const delivery = await deliverClubInvitationEmail(queued.data);
  if (delivery.ok) {
    await context.supabase.from("club_invitation_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: delivery.providerId, last_error: null }).eq("id", queued.data.id);
  } else {
    await context.supabase.from("club_invitation_email_outbox").update({ status: delivery.retryable ? "failed" : "cancelled", available_at: new Date(Date.now() + 10 * 60_000).toISOString(), last_error: delivery.error.slice(0, 500) }).eq("id", queued.data.id);
  }
  revalidatePath(`/clubs/manage/${clubId}`);
  return delivery.ok
    ? { ok: true, message: profile.data?.role === "student" ? "The student was added and the Club introduction email was sent." : "Invitation sent. The student will join automatically after registering with this email." }
    : { ok: true, message: "Invitation saved and automatic joining is ready. Email delivery remains queued; check the Resend and Brevo settings." };
}

export async function revokeStudentClubInvitation(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const invitationId = String(formData.get("invitation_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !context.canGovern || !invitationId) return denied;
  const invitation = await context.supabase.from("club_member_invitations").update({ status: "revoked" }).eq("id", invitationId).eq("club_id", clubId).eq("status", "pending").select("id").maybeSingle();
  if (!invitation.data) return { ok: false, message: "This invitation is no longer pending." };
  await context.supabase.from("club_invitation_email_outbox").update({ status: "cancelled" }).eq("invitation_id", invitationId).in("status", ["pending", "failed"]);
  revalidatePath(`/clubs/manage/${clubId}`);
  return { ok: true, message: "Invitation revoked. The student will not be joined automatically." };
}

export async function publishClubAnnouncement(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const post = parseClubPostInput(formData);
  if (!post) return invalid;
  const requestedMediaId = String(formData.get("media_id") ?? "");
  let mediaId: string | null = null;
  if (requestedMediaId) {
    const { data: media } = await context.supabase.from("club_media").select("id").eq("id", requestedMediaId).eq("club_id", clubId).maybeSingle();
    if (!media) return { ok: false, message: "Choose an image from this Club's media library." };
    mediaId = media.id;
  }
  const { error } = await context.supabase.from("club_announcements").insert({
    club_id: clubId,
    ...post,
    media_id: mediaId,
    published_by: context.user.id,
  });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return { ok: true, message: "Published to this club. School-wide announcements require a separate review submission." };
}

/** Pair record id with club id on every write; form fields alone never grant access. */
export async function editClubMeeting(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const meeting = parseMeetingInput(formData);
  if (!meeting) return invalid;
  const { data, error } = await context.supabase.from("club_meetings").update(meeting)
    .eq("id", String(formData.get("record_id") ?? "")).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Meeting not updated. It may have been removed or your access changed." };
  revalidatePath("/clubs", "layout");
  revalidatePath("/calendar");
  return saved;
}

export async function editClubPost(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const post = parseClubPostInput(formData);
  if (!post) return invalid;
  const { data, error } = await context.supabase.from("club_announcements").update({ ...post, published: formData.get("published") === "on", updated_at: new Date().toISOString() })
    .eq("id", String(formData.get("record_id") ?? "")).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Post not updated. It may have been removed or your access changed." };
  revalidatePath("/clubs", "layout");
  return saved;
}

async function deleteClubContent(formData: FormData, table: "club_meetings" | "club_announcements") {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  if (formData.get("confirm") !== "yes") return { ok: false, message: "Confirm deletion before continuing." };
  const { data, error } = await context.supabase.from(table).delete()
    .eq("id", String(formData.get("record_id") ?? "")).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Nothing was deleted. The record may no longer exist or your access changed." };
  revalidatePath("/clubs", "layout");
  if (table === "club_meetings") revalidatePath("/calendar");
  return { ok: true, message: "Deleted. This does not delete other club content." };
}

export async function deleteClubMeeting(formData: FormData) { return deleteClubContent(formData, "club_meetings"); }
export async function deleteClubPost(formData: FormData) { return deleteClubContent(formData, "club_announcements"); }

export async function reviewClubMembership(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const context = await managerContext(clubId);
  if (!context?.canGovern) return denied;
  if (!["active", "rejected"].includes(status)) return invalid;
  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim();
  if (status === "rejected" && (rejectionReason.length < 3 || rejectionReason.length > 1000)) return { ok: false, message: "Add a clear rejection reason (3–1,000 characters)." };
  const { data, error } = await context.supabase.from("club_memberships").update({
    status: status as "active" | "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.user.id,
    rejection_reason: status === "rejected" ? rejectionReason : null,
    member_reply: null,
    ended_at: status === "rejected" ? new Date().toISOString() : null,
  }).eq("id", membershipId).eq("club_id", clubId).eq("status", "pending").select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "The request was not changed. It may have been reviewed already." };
  if (status === "active") await context.supabase.rpc("record_analytics_event", { p_event_name: "club_join_completed", p_route: `/clubs/manage/${clubId}`, p_entity_id: clubId, p_metadata: { mode: "approved" } });
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/profile");
  return saved;
}

export async function addClubOfficer(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context?.canGovern) return denied;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestedName = String(formData.get("display_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const termStart = parseOptionalDateOnly(String(formData.get("term_start") ?? ""));
  const termEnd = parseOptionalDateOnly(String(formData.get("term_end") ?? ""));
  if (!isAllowedEmail(email) || requestedName.length > 120 || title.length < 2 || title.length > 80 || termStart === undefined || termEnd === undefined) return invalid;
  if (termStart && termEnd && termEnd < termStart) return invalid;

  const { data, error } = await context.supabase.rpc("preassign_club_officer", {
    p_club_id: clubId,
    p_email: email,
    p_display_name: requestedName || email.split("@")[0],
    p_title: title,
    p_term_start: termStart,
    p_term_end: termEnd,
  });
  if (error) return ["42703", "PGRST202", "PGRST204"].includes(error.code ?? "")
    ? { ok: false, message: "Apply supabase/board-and-advisor-preauthorization.sql, then try again." }
    : { ok: false, message: /already assigned/i.test(error.message) ? "That email is already assigned to this Club board." : failed.message };
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs/manage");
  revalidatePath("/clubs");
  return { ok: true, message: data ? "Board member saved. Access is active; Club membership is not required." : "Board member saved. Access will activate automatically when this email creates an account." };
}

export async function removeClubOfficer(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const officerId = String(formData.get("officer_id") ?? "");
  const context = await managerContext(clubId);
  if (!context?.canGovern || !officerId) return denied;
  const portrait = await context.supabase.from("club_officers").select("avatar_path").eq("id", officerId).eq("club_id", clubId).maybeSingle();
  const { data, error } = await context.supabase.from("club_officers").delete().eq("id", officerId).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  if (portrait.data?.avatar_path) await context.supabase.storage.from("board-avatars").remove([portrait.data.avatar_path]);
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs/manage");
  revalidatePath("/clubs");
  return saved;
}

export async function uploadOwnBoardAvatar(formData: FormData) {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "");
  const officerId = String(formData.get("officer_id") ?? "");
  const image = formData.get("avatar");
  if (!user || !clubId || !officerId || !isSupabaseConfigured()) return denied;
  if (!(image instanceof File) || image.size <= 0 || image.size > MAX_IMAGE_UPLOAD_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    return { ok: false, message: "Choose a JPG, PNG, or WebP portrait up to 4 MB." };
  }
  const supabase = await createServerClient();
  const [{ data: officer, error: officerError }, { data: canGovern }] = await Promise.all([
    supabase.from("club_officers").select("id,club_id,profile_id,avatar_path").eq("id", officerId).eq("club_id", clubId).maybeSingle(),
    supabase.rpc("can_govern_club", { p_club_id: clubId }),
  ]);
  if (officerError?.code === "42703") return { ok: false, message: "Board portraits require supabase/schema.sql." };
  if (!officer || !officer.profile_id || (officer.profile_id !== user.id && canGovern !== true)) return { ok: false, message: "You may upload only your own board portrait." };
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[image.type];
  const storagePath = `${clubId}/${officer.profile_id}/${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage.from("board-avatars").upload(storagePath, image, { contentType: image.type, upsert: false });
  if (upload.error) return { ok: false, message: "Portrait upload failed. Apply supabase/schema.sql and check your board assignment." };
  const savedAvatar = await supabase.rpc("set_club_officer_avatar", { p_officer_id: officerId, p_avatar_path: storagePath });
  if (savedAvatar.error) {
    await supabase.storage.from("board-avatars").remove([storagePath]);
    return { ok: false, message: "Portrait could not be attached to this board position." };
  }
  if (savedAvatar.data && savedAvatar.data !== storagePath) await supabase.storage.from("board-avatars").remove([savedAvatar.data]);
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return { ok: true, message: "Board portrait updated." };
}

export async function removeOwnBoardAvatar(formData: FormData) {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "");
  const officerId = String(formData.get("officer_id") ?? "");
  if (!user || !clubId || !officerId || !isSupabaseConfigured()) return denied;
  const supabase = await createServerClient();
  const result = await supabase.rpc("set_club_officer_avatar", { p_officer_id: officerId, p_avatar_path: null });
  if (result.error) return { ok: false, message: "You may remove only your own board portrait." };
  if (result.data) await supabase.storage.from("board-avatars").remove([result.data]);
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return { ok: true, message: "Board portrait removed." };
}

export async function addClubAdvisor(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !["staff", "admin"].includes(context.user.role)) return denied;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const { data: profile } = await context.supabase.from("profiles").select("id, full_name, email, role").eq("email", email).maybeSingle();
  if (!profile || !["teacher", "advisor"].includes(profile.role)) return { ok: false, message: "Choose a registered Teacher or Advisor account. Admin access does not make someone a Club advisor." };
  const { error } = await context.supabase.from("club_advisors").upsert({
    club_id: clubId,
    profile_id: profile.id,
    display_name: profile.full_name ?? profile.email,
    contact_email: profile.email,
  }, { onConflict: "club_id,profile_id" });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs");
  return saved;
}

export async function removeClubAdvisor(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const advisorId = String(formData.get("advisor_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !["staff", "admin"].includes(context.user.role) || !advisorId) return denied;
  const { data, error } = await context.supabase.from("club_advisors").delete().eq("id", advisorId).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs");
  return { ok: true, message: "Advisor removed. Their account role and Admin permissions were not changed." };
}

const linkPlatforms = ["google_classroom", "instagram", "discord", "whatsapp", "youtube", "tiktok", "website", "other"] as const;

export async function addClubLink(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const platform = String(formData.get("platform") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!linkPlatforms.includes(platform as (typeof linkPlatforms)[number]) || label.length < 1 || label.length > 80 || value.length < 1 || value.length > 500) return invalid;
  if (platform !== "google_classroom") {
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) return invalid;
    } catch {
      return { ok: false, message: "Enter a complete http:// or https:// link." };
    }
  }
  const count = await context.supabase.from("club_links").select("id", { count: "exact", head: true }).eq("club_id", clubId);
  if ((count.count ?? 0) >= 50) return { ok: false, message: "A Club can publish up to 50 links." };
  const { error } = await context.supabase.from("club_links").insert({
    club_id: clubId,
    platform: platform as (typeof linkPlatforms)[number],
    label,
    value,
    sort_order: count.count ?? 0,
    created_by: context.user.id,
  });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return saved;
}

export async function removeClubLink(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const linkId = String(formData.get("link_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !linkId) return denied;
  const { data, error } = await context.supabase.from("club_links").delete().eq("id", linkId).eq("club_id", clubId).select("id").maybeSingle();
  if (error || !data) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return saved;
}

export async function uploadClubImage(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  const image = formData.get("image_large");
  const medium = formData.get("image_medium");
  const thumbnail = formData.get("image_thumbnail");
  const title = String(formData.get("title") ?? "").trim();
  const altText = String(formData.get("alt_text") ?? "").trim();
  const permissionBasis = String(formData.get("permission_basis") ?? "");
  const permissionNote = String(formData.get("permission_note") ?? "").trim();
  const imageWidth = Number(formData.get("image_width"));
  const imageHeight = Number(formData.get("image_height"));
  const visibility = formData.get("visibility") === "gallery" ? "gallery" : "private";
  const isCover = formData.get("is_cover") === "on";
  if (!context) return denied;
  if (![image, medium, thumbnail].every((file) => file instanceof File && file.type === "image/webp" && file.size > 0 && file.size <= MAX_IMAGE_UPLOAD_BYTES)) return { ok: false, message: "Prepare all three optimized WebP sizes before uploading." };
  if ((image as File).size + (medium as File).size + (thumbnail as File).size > MAX_IMAGE_UPLOAD_BYTES) return { ok: false, message: "The optimized image set is still too large. Crop closer or choose a smaller source." };
  if (!isMeaningfulAltText(altText) || title.length > 120 || permissionNote.length > 500 || !isClubMediaPermission(permissionBasis) || formData.get("permission_confirmed") !== "on") return { ok: false, message: "Add meaningful alternative text and confirm a valid sharing-permission record." };
  if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageWidth < 1 || imageHeight < 1 || imageWidth > 12000 || imageHeight > 12000) return invalid;
  const id = crypto.randomUUID();
  const storagePath = `${clubId}/${id}-large.webp`;
  const mediumPath = `${clubId}/${id}-medium.webp`;
  const thumbnailPath = `${clubId}/${id}-thumbnail.webp`;
  const files = [{ path: storagePath, file: image as File }, { path: mediumPath, file: medium as File }, { path: thumbnailPath, file: thumbnail as File }];
  const uploaded: string[] = [];
  for (const item of files) {
    const { error } = await context.supabase.storage.from("club-media").upload(item.path, item.file, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (error) {
      if (uploaded.length) await context.supabase.storage.from("club-media").remove(uploaded);
      return { ok: false, message: mediaUploadErrorMessage(error) };
    }
    uploaded.push(item.path);
  }
  let { data: insertedMedia, error: rowError } = await context.supabase.from("club_media").insert({
    club_id: clubId,
    media_type: "image",
    storage_path: storagePath,
    medium_path: mediumPath,
    thumbnail_path: thumbnailPath,
    image_width: imageWidth,
    image_height: imageHeight,
    file_size: (image as File).size,
    title: title || null,
    alt_text: altText,
    uploaded_by: context.user.id,
    visibility,
    is_cover: false,
    permission_basis: permissionBasis,
    permission_note: permissionNote || null,
    permission_confirmed_by: context.user.id,
    permission_confirmed_at: new Date().toISOString(),
  }).select("id").maybeSingle();
  let compatibilityUpload = false;
  if (missingMediaProcessingSchema(rowError)) {
    await context.supabase.storage.from("club-media").remove([mediumPath, thumbnailPath]);
    uploaded.splice(0, uploaded.length, storagePath);
    ({ data: insertedMedia, error: rowError } = await context.supabase.from("club_media").insert({ club_id: clubId, media_type: "image", storage_path: storagePath, title: title || null, alt_text: altText, uploaded_by: context.user.id, visibility, is_cover: false }).select("id").maybeSingle());
    compatibilityUpload = !rowError;
  }
  // Storage and Postgres are separate systems; roll back the object when its
  // metadata row fails so an inaccessible orphan file is not retained.
  if (rowError) {
    const { error: cleanupError } = await context.supabase.storage.from("club-media").remove(uploaded);
    return { ok: false, message: cleanupError ? "Photo metadata failed, and file cleanup failed. Contact Support before retrying." : "Photo metadata could not be saved. Apply supabase/schema.sql; uploaded files were removed." };
  }
  if (isCover && insertedMedia) {
    const { data: previousCover } = await context.supabase.from("club_media").select("id").eq("club_id", clubId).eq("is_cover", true).neq("id", insertedMedia.id).maybeSingle();
    const { error: clearCoverError } = await context.supabase.from("club_media").update({ is_cover: false }).eq("club_id", clubId).eq("is_cover", true).neq("id", insertedMedia.id);
    const { error: setCoverError } = clearCoverError
      ? { error: clearCoverError }
      : await context.supabase.from("club_media").update({ is_cover: true }).eq("id", insertedMedia.id).eq("club_id", clubId);
    if (setCoverError) {
      if (previousCover) await context.supabase.from("club_media").update({ is_cover: true }).eq("id", previousCover.id).eq("club_id", clubId);
      revalidatePath(`/clubs/manage/${clubId}`);
      return { ok: false, message: "Photo uploaded, but its cover placement could not be saved. The previous cover was preserved." };
    }
  }
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  if (compatibilityUpload) return { ok: true, message: "Photo uploaded in compatibility mode. Apply supabase/schema.sql to retain all sizes and permission records." };
  return { ok: true, message: isCover ? "Photo uploaded and set as the Club cover." : visibility === "gallery" ? "Photo uploaded to the public gallery." : "Photo uploaded privately to the media library." };
}

export async function updateClubImagePlacement(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const mediaId = String(formData.get("media_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !mediaId) return denied;
  const visibility = formData.get("visibility") === "gallery" ? "gallery" : "private";
  const isCover = formData.get("is_cover") === "on";
  const title = String(formData.get("title") ?? "").trim();
  const altText = String(formData.get("alt_text") ?? "").trim();
  const permissionBasis = String(formData.get("permission_basis") ?? "");
  const permissionNote = String(formData.get("permission_note") ?? "").trim();
  if (!isMeaningfulAltText(altText) || title.length > 120 || permissionNote.length > 500 || !isClubMediaPermission(permissionBasis) || formData.get("permission_confirmed") !== "on") return { ok: false, message: "Add meaningful alternative text and confirm a valid sharing-permission record." };
  const { data: previousCover } = isCover ? await context.supabase.from("club_media").select("id").eq("club_id", clubId).eq("is_cover", true).neq("id", mediaId).maybeSingle() : { data: null };
  if (isCover) {
    const { error } = await context.supabase.from("club_media").update({ is_cover: false }).eq("club_id", clubId).eq("is_cover", true).neq("id", mediaId);
    if (error) return failed;
  }
  let { data, error } = await context.supabase.from("club_media").update({ title: title || null, alt_text: altText, permission_basis: permissionBasis, permission_note: permissionNote || null, permission_confirmed_by: context.user.id, permission_confirmed_at: new Date().toISOString(), visibility, is_cover: isCover }).eq("id", mediaId).eq("club_id", clubId).select("id").maybeSingle();
  let compatibilityUpdate = false;
  if (missingMediaProcessingSchema(error)) {
    ({ data, error } = await context.supabase.from("club_media").update({ title: title || null, alt_text: altText, visibility, is_cover: isCover }).eq("id", mediaId).eq("club_id", clubId).select("id").maybeSingle());
    compatibilityUpdate = !error;
  }
  if (error || !data) {
    if (previousCover) await context.supabase.from("club_media").update({ is_cover: true }).eq("id", previousCover.id).eq("club_id", clubId);
    return failed;
  }
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  return { ok: true, message: compatibilityUpdate ? "Photo details saved in compatibility mode. Apply supabase/schema.sql to retain permission records." : "Photo details and permission record updated." };
}

export async function deleteClubImage(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const mediaId = String(formData.get("media_id") ?? "");
  const context = await managerContext(clubId);
  if (!context || !mediaId) return denied;
  const [{ count: clubPostUses }, { count: schoolPostUses }, { count: submissionUses }] = await Promise.all([
    context.supabase.from("club_announcements").select("id", { count: "exact", head: true }).eq("media_id", mediaId),
    context.supabase.from("announcements").select("id", { count: "exact", head: true }).eq("media_id", mediaId),
    context.supabase.from("school_announcement_submissions").select("id", { count: "exact", head: true }).eq("media_id", mediaId),
  ]);
  if ((clubPostUses ?? 0) + (schoolPostUses ?? 0) + (submissionUses ?? 0) > 0) return { ok: false, message: "This photo is used by an announcement. Remove it from the announcement before deleting it." };
  let { data: media, error: mediaError } = await context.supabase.from("club_media").select("storage_path,medium_path,thumbnail_path").eq("id", mediaId).eq("club_id", clubId).maybeSingle();
  if (missingMediaProcessingSchema(mediaError)) {
    const legacy = await context.supabase.from("club_media").select("storage_path").eq("id", mediaId).eq("club_id", clubId).maybeSingle();
    media = legacy.data ? { ...legacy.data, medium_path: null, thumbnail_path: null } : null;
    mediaError = legacy.error;
  }
  if (mediaError || !media) return { ok: false, message: "Photo not found or no longer accessible." };
  const { error: rowError } = await context.supabase.from("club_media").delete().eq("id", mediaId).eq("club_id", clubId);
  if (rowError) return { ok: false, message: rowError.code === "23503" ? "This photo is used by an announcement. Remove it from the announcement before deleting it." : "The media library entry could not be removed. Refresh and try again." };
  const paths = [media.storage_path, media.medium_path, media.thumbnail_path].filter((path): path is string => Boolean(path));
  const { error } = await context.supabase.storage.from("club-media").remove(paths);
  revalidatePath(`/clubs/manage/${clubId}`);
  revalidatePath("/clubs", "layout");
  if (error) return { ok: false, message: "The library entry was removed, but the stored file needs administrator cleanup." };
  return { ok: true, message: "Photo removed from the gallery and storage." };
}

export async function updateClubCompliance(formData: FormData) {
  const clubId = String(formData.get("club_id") ?? "");
  const context = await managerContext(clubId);
  if (!context) return denied;
  const schoolYear = String(formData.get("school_year") ?? "").trim();
  const rosterCount = Number(formData.get("roster_count"));
  if (!/^\d{4}-\d{4}$/.test(schoolYear) || !Number.isInteger(rosterCount) || rosterCount < 0 || rosterCount > 10000) return invalid;
  const firstYear = Number(schoolYear.slice(0, 4));
  if (Number(schoolYear.slice(5)) !== firstYear + 1) return invalid;
  const { error } = await context.supabase.from("club_compliance").upsert({
    club_id: clubId,
    school_year: schoolYear,
    roster_count: rosterCount,
    constitution_on_file: formData.get("constitution_on_file") === "on",
    college_alignment_on_file: formData.get("college_alignment_on_file") === "on",
    annual_event_completed: formData.get("annual_event_completed") === "on",
    community_service_completed: formData.get("community_service_completed") === "on",
    fundraiser_completed: formData.get("fundraiser_completed") === "on",
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "club_id,school_year" });
  if (error) return failed;
  revalidatePath(`/clubs/manage/${clubId}`);
  return saved;
}
