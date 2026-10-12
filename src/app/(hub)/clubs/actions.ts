"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { clubCategories } from "@/lib/data";
import { getClubBySlug } from "@/lib/clubs";
import type { ClubChatMessage, ClubChatModerationMember } from "@/lib/supabase/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { CLUB_CHAT_POLICY_VERSION, validChatModerationReason } from "@/lib/chat-policy";

export type ActionState = { ok: boolean; message: string } | null;

export async function submitClubApplication(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "Please sign in with your Bayside teacher account first." };
  }
  if (user.role !== "teacher") {
    return { ok: false, message: "New Club applications can only be submitted by a teacher." };
  }
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: "Supabase is not configured. Add the env keys in .env.local to submit.",
    };
  }

  const clubName = String(formData.get("club_name") ?? "").trim();
  const category = String(formData.get("category") ?? "Other").trim();
  const description = String(formData.get("description") ?? "").trim();
  const meetingDays = String(formData.get("meeting_days") ?? "").trim();
  const contactEmail = user.email;

  if (clubName.length < 3 || clubName.length > 120) {
    return { ok: false, message: "Club name is required (3–120 characters)." };
  }
  if (!clubCategories.includes(category)) {
    return { ok: false, message: "Pick a valid category." };
  }
  if (description.length < 10 || description.length > 1000) {
    return { ok: false, message: "Description is required (10–1000 characters)." };
  }
  if (meetingDays.length > 100) {
    return { ok: false, message: "Meeting days must be 100 characters or fewer." };
  }
  if (contactEmail.length > 320) {
    return { ok: false, message: "Contact email must be 320 characters or fewer." };
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, message: "Enter a valid contact email." };
  }

  const supabase = await createServerClient();
  const limit = await checkRateLimit(supabase, "club_application");
  if (!limit.allowed && !limit.unavailable) return { ok: false, message: "Too many Club applications. Try again later." };
  const { data: existing } = await supabase.from("club_applications")
    .select("id")
    .eq("submitted_by", user.id)
    .eq("status", "pending")
    .ilike("club_name", clubName)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, message: "You already have a pending application for a Club with this name." };
  const { error } = await supabase.from("club_applications").insert({
    club_name: clubName,
    category,
    description,
    meeting_days: meetingDays || null,
    contact_email: contactEmail || user.email,
    submitted_by: user.id,
  });

  if (error) {
    console.error("Club application submission failed", { code: error.code, message: error.message });
    if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
      return { ok: false, message: "The database blocked this submission. Ask an Admin to run teacher_club_application_workflow.sql and confirm your account role is Teacher." };
    }
    if (error.code === "23514") {
      return { ok: false, message: "One of the application fields does not match the database rules. Check the category and text lengths, then try again." };
    }
    if (error.code === "23502") {
      const missingColumn = error.message.match(/column ["']([^"']+)["']/i)?.[1];
      return { ok: false, message: missingColumn
        ? `The database still requires an obsolete field (${missingColumn}). Ask an Admin to rerun the latest teacher_club_application_workflow.sql migration.`
        : "The Club application database schema is out of date. An Admin needs to rerun the latest teacher_club_application_workflow.sql migration." };
    }
    if (error.code === "23505") {
      return { ok: false, message: "A matching Club application already exists." };
    }
    return { ok: false, message: `The application could not be submitted (database code ${error.code || "unknown"}). Contact an Admin if it happens again.` };
  }

  revalidatePath("/clubs/apply");
  revalidatePath("/admin/clubs");
  revalidatePath("/admin");
  return {
    ok: true,
    message: "Application submitted. If an Admin approves it, the Club will be published and added to your managed Clubs automatically.",
  };
}

export type InterestState = { count: number; joined: boolean; available: boolean };

export async function getClubInterestInfo(slug: string): Promise<InterestState> {
  if (!isSupabaseConfigured() || !(await getClubBySlug(slug))) {
    return { count: 0, joined: false, available: false };
  }

  const user = await getCurrentUser();
  const supabase = await createServerClient();
  const { data: count, error } = await supabase
    .rpc("club_interest_count", { p_slug: slug });
  if (error) return { count: 0, joined: false, available: false };

  let joined = false;
  if (user) {
    const { data: row } = await supabase
      .from("club_interests")
      .select("id")
      .eq("user_id", user.id)
      .eq("club_slug", slug)
      .maybeSingle();
    joined = Boolean(row);
  }
  return { count: Number(count ?? 0), joined, available: true };
}

export async function toggleClubInterest(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!user || !isSupabaseConfigured() || !(await getClubBySlug(slug))) return;

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("club_interests")
    .select("id")
    .eq("user_id", user.id)
    .eq("club_slug", slug)
    .maybeSingle();

  if (existing) {
    await supabase.from("club_interests").delete().eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("club_interests")
      .insert({ user_id: user.id, club_slug: slug });
    if (error) return;
  }

  revalidatePath(`/clubs/${slug}`);
}

export type MembershipState = {
  available: boolean;
  status: "pending" | "active" | "rejected" | "left" | null;
  rejectionReason: string | null;
  memberReply: string | null;
};

export async function getClubMembershipInfo(clubId?: string): Promise<MembershipState> {
  const user = await getCurrentUser();
  if (!clubId || !user || !isSupabaseConfigured()) return { available: false, status: null, rejectionReason: null, memberReply: null };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("club_memberships")
    .select("status, rejection_reason, member_reply")
    .eq("club_id", clubId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) return { available: false, status: null, rejectionReason: null, memberReply: null };
  return { available: true, status: data?.status ?? null, rejectionReason: data?.rejection_reason ?? null, memberReply: data?.member_reply ?? null };
}

export async function requestClubMembership(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!user || !clubId || !slug || !isSupabaseConfigured()) return;

  const supabase = await createServerClient();
  const limit = await checkRateLimit(supabase, "membership_action");
  if (!limit.allowed && !limit.unavailable) return;
  const { data: club } = await supabase
    .from("clubs")
    .select("join_policy, recruiting_status")
    .eq("id", clubId)
    .eq("status", "published")
    .maybeSingle();
  if (!club || club.recruiting_status !== "recruiting") return;

  const status = club.join_policy === "instant" ? "active" : "pending";
  const membership = await supabase.from("club_memberships").upsert(
    { club_id: clubId, profile_id: user.id, status, requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, rejection_reason: null, member_reply: null, ended_at: null },
    { onConflict: "club_id,profile_id" },
  );
  if (!membership.error) {
    await supabase.rpc("record_analytics_event", { p_event_name: "club_join_started", p_route: `/clubs/${slug}`, p_entity_id: clubId, p_metadata: { status } });
    if (status === "active") await supabase.rpc("record_analytics_event", { p_event_name: "club_join_completed", p_route: `/clubs/${slug}`, p_entity_id: clubId, p_metadata: { mode: "instant" } });
  }
  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/profile");
}

export async function leaveClub(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!user || !clubId || !slug || !isSupabaseConfigured()) return;
  const supabase = await createServerClient();
  await supabase
    .from("club_memberships")
    .update({ status: "left", ended_at: new Date().toISOString() })
    .eq("club_id", clubId)
    .eq("profile_id", user.id);
  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/profile");
}

export async function replyToMembershipDecision(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const membershipId = String(formData.get("membership_id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!user || !membershipId || !reply || reply.length > 1000 || !isSupabaseConfigured()) return;
  const supabase = await createServerClient();
  await supabase.rpc("reply_to_membership_decision", { p_membership_id: membershipId, p_reply: reply });
  revalidatePath("/profile");
}

export type ClubCommunicationState = {
  available: boolean;
  messages: ClubChatMessage[];
  moderationReady: boolean;
  agreed: boolean;
  restricted: boolean;
  restrictionReason: string | null;
  canModerate: boolean;
  moderationMembers: ClubChatModerationMember[];
};

/** Load member-only chat through a safe RPC that never returns profile emails. */
export async function getClubCommunication(clubId?: string): Promise<ClubCommunicationState> {
  const user = await getCurrentUser();
  if (!clubId || !user || !isSupabaseConfigured()) {
    return { available: false, messages: [], moderationReady: false, agreed: false, restricted: false, restrictionReason: null, canModerate: false, moderationMembers: [] };
  }

  const supabase = await createServerClient();
  const [messageResult, stateResult] = await Promise.all([
    supabase.rpc("get_club_chat_messages", { p_club_id: clubId, p_limit: 200 }),
    supabase.rpc("get_club_chat_state", { p_club_id: clubId, p_policy_version: CLUB_CHAT_POLICY_VERSION }),
  ]);
  if (messageResult.error) return { available: false, messages: [], moderationReady: false, agreed: false, restricted: false, restrictionReason: null, canModerate: false, moderationMembers: [] };
  const chatState = stateResult.data?.[0];
  const memberResult = chatState?.can_moderate
    ? await supabase.rpc("get_club_chat_moderation_members", { p_club_id: clubId })
    : { data: [] as ClubChatModerationMember[], error: null };
  return {
    available: true,
    messages: messageResult.data ?? [],
    moderationReady: !stateResult.error && !memberResult.error,
    agreed: chatState?.agreed === true,
    restricted: chatState?.restricted === true,
    restrictionReason: chatState?.restriction_reason ?? null,
    canModerate: chatState?.can_moderate === true,
    moderationMembers: memberResult.data ?? [],
  };
}

export type ClubMessageActionState = {
  ok: boolean;
  message: string;
} | null;

/** Post a chat message; RLS independently verifies Club access and authorship. */
export async function postClubMessage(
  _previous: ClubMessageActionState,
  formData: FormData,
): Promise<ClubMessageActionState> {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!user) return { ok: false, message: "Sign in to send a message." };
  if (!clubId || !slug || !isSupabaseConfigured()) {
    return { ok: false, message: "Club chat is not available yet." };
  }
  if (body.length < 1 || body.length > 2000) {
    return { ok: false, message: "Messages must be between 1 and 2,000 characters." };
  }

  const supabase = await createServerClient();
  const permission = await supabase.rpc("can_post_club_chat", { p_club_id: clubId, p_policy_version: CLUB_CHAT_POLICY_VERSION });
  if (permission.error) return { ok: false, message: "Chat safety controls are not ready. Ask an Admin to apply chat_safety_moderation.sql." };
  if (!permission.data) {
    const state = await supabase.rpc("get_club_chat_state", { p_club_id: clubId, p_policy_version: CLUB_CHAT_POLICY_VERSION });
    if (state.data?.[0]?.restricted) return { ok: false, message: "Your chat posting permission is paused. Contact the Club Advisor if you believe this is a mistake." };
    return { ok: false, message: "Review and accept the Club chat rules before sending your first message." };
  }
  const { error } = await supabase.from("club_messages").insert({
    club_id: clubId,
    author_id: user.id,
    body,
  });
  if (error) return { ok: false, message: "Message not sent. Check your Club membership and try again." };

  revalidatePath(`/clubs/${slug}`);
  return { ok: true, message: "Message sent." };
}

export async function acceptClubChatRules(formData: FormData) {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const confirmed = formData.get("accept_rules") === "yes";
  if (!user || !clubId || !slug || !confirmed || !isSupabaseConfigured()) return { ok: false, message: "Confirm that you will follow every chat rule." };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("accept_club_chat_rules", { p_club_id: clubId, p_policy_version: CLUB_CHAT_POLICY_VERSION });
  if (error) return { ok: false, message: "The agreement could not be recorded. Ask an Admin to apply chat_safety_moderation.sql." };
  revalidatePath(`/clubs/${slug}`);
  return { ok: true, message: "Chat rules accepted. You can now take part in the conversation." };
}

export async function setClubChatRestriction(formData: FormData) {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  const restricted = formData.get("operation") === "restrict";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!user || !clubId || !slug || !profileId || !isSupabaseConfigured()) return { ok: false, message: "Chat moderation is not available." };
  if (restricted && !validChatModerationReason(reason)) return { ok: false, message: "Enter a specific reason between 3 and 500 characters." };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_club_chat_restriction", {
    p_club_id: clubId,
    p_profile_id: profileId,
    p_restricted: restricted,
    p_reason: reason || null,
  });
  if (error) {
    if (["42501", "22023"].includes(error.code)) return { ok: false, message: error.code === "42501" ? "Only an Admin or this Club’s Advisor can change chat access." : "This member’s chat access cannot be changed with these details." };
    return { ok: false, message: "Chat access was not changed. Apply chat_safety_moderation.sql and try again." };
  }
  revalidatePath(`/clubs/${slug}`);
  return { ok: true, message: restricted ? "Chat posting permission paused and recorded." : "Chat posting permission restored and recorded." };
}

/** Messages are immutable; authors and Club managers may remove them. */
export async function deleteClubMessage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const clubId = String(formData.get("club_id") ?? "").trim();
  const messageId = String(formData.get("message_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!user || !clubId || !messageId || !slug || !isSupabaseConfigured()) return;

  const supabase = await createServerClient();
  await supabase
    .from("club_messages")
    .delete()
    .eq("id", messageId)
    .eq("club_id", clubId);
  revalidatePath(`/clubs/${slug}`);
}
