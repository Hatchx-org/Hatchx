"use server";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export async function submitSchoolAnnouncement(_state: string, form: FormData) {
  const user = await getCurrentUser();
  if (!user) return "Sign in to submit an announcement.";
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const clubId = String(form.get("club_id") ?? "");
  const requestedMediaId = String(form.get("media_id") ?? "");
  if (title.length < 3 || title.length > 120 || body.length < 3 || body.length > 10000 || !clubId) return "Choose a club and complete the title and announcement.";
  const db = await createServerClient();
  const limit = await checkRateLimit(db, "announcement_submit");
  if (!limit.allowed && !limit.unavailable) return "Too many announcement submissions. Try again later.";
  let mediaId: string | null = null;
  if (requestedMediaId) {
    const { data: media } = await db.from("club_media").select("id").eq("id", requestedMediaId).eq("club_id", clubId).maybeSingle();
    if (!media) return "Choose a photo from the selected Club's media library.";
    mediaId = media.id;
  }
  // RLS checks current, club-scoped leadership at the moment of submission.
  const { error } = await db.from("school_announcement_submissions").insert({ title, body, club_id: clubId, author_id: user.id, media_id: mediaId });
  if (error) return "Unable to submit. Confirm your club leadership access or contact Support.";
  revalidatePath("/announcements/submit");
  revalidatePath("/admin/review");
  return "Submitted for administrator review. It is not public yet.";
}

export async function reviewSchoolAnnouncement(_state: string, form: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return "Only administrators may publish submitted announcements.";
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim();
  if (!approve && note.length < 3) return "Give a reason so the author can revise the announcement.";
  const db = await createServerClient();
  const { error } = await db.rpc("review_school_announcement", { p_id: String(form.get("id")), p_approve: approve, p_note: note });
  if (error) return "Review could not be saved. Refresh to check whether it was already reviewed.";
  revalidatePath("/admin/review");
  revalidatePath("/announcements/submit");
  revalidatePath("/announcements");
  revalidatePath("/");
  return approve ? "Approved and published." : "Rejected with feedback.";
}
