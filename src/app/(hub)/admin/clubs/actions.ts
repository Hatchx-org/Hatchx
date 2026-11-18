"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { slugify } from "@/lib/data";
import { parseAdminClubInput } from "@/lib/admin-club-input";
import { createServerClient } from "@/lib/supabase/server";

export type ClubActionState = { ok: boolean; message: string };
const denied = { ok: false, message: "Administrator permission is required." };

async function adminContext() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return { user, db: await createServerClient() };
}

function refreshClubPages(id?: string, slug?: string) {
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  revalidatePath("/clubs/manage");
  if (id) revalidatePath(`/clubs/manage/${id}`);
  if (slug) revalidatePath(`/clubs/${slug}`);
  revalidatePath("/calendar");
}

type AdminMeeting = NonNullable<ReturnType<typeof parseAdminClubInput>>["meeting"];

async function saveMeeting(db: Awaited<ReturnType<typeof createServerClient>>, clubId: string, meeting: AdminMeeting) {
  const { data: current } = await db.from("club_meetings").select("id").eq("club_id", clubId).order("created_at").limit(1).maybeSingle();
  if (!meeting) {
    if (!current) return true;
    const { error } = await db.from("club_meetings").delete().eq("id", current.id).eq("club_id", clubId);
    return !error;
  }
  const values = { day_of_week: meeting.dayOfWeek, start_time: meeting.startTime, end_time: meeting.endTime, location: meeting.location };
  const result = current
    ? await db.from("club_meetings").update(values).eq("id", current.id).eq("club_id", clubId)
    : await db.from("club_meetings").insert({ club_id: clubId, ...values });
  return !result.error;
}

export async function createAdminClub(formData: FormData): Promise<ClubActionState> {
  const context = await adminContext();
  if (!context) return denied;
  const input = parseAdminClubInput(formData);
  if (!input) return { ok: false, message: "Check the Club name, description, category, dates, email, and meeting time." };
  const slug = `${slugify(input.name) || "club"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: club, error } = await context.db.from("clubs").insert({
    slug,
    name: input.name,
    short_description: input.shortDescription,
    full_description: input.shortDescription,
    category: input.category,
    interest_tags: [input.category],
    contact_email: input.contactEmail,
    status: input.status,
    recruiting_status: input.recruitingStatus,
    join_policy: input.joinPolicy,
    active_start_date: input.activeStartDate,
    active_end_date: input.activeEndDate,
    created_by: context.user.id,
  }).select("id").maybeSingle();
  if (error || !club) return { ok: false, message: "The Club could not be created. Check the latest Supabase migration and try again." };
  const meetingSaved = await saveMeeting(context.db, club.id, input.meeting);
  refreshClubPages(club.id, slug);
  return meetingSaved ? { ok: true, message: `${input.name} was created.` } : { ok: false, message: `${input.name} was created, but its meeting could not be saved. Open the Club workspace to retry.` };
}

export async function updateAdminClub(formData: FormData): Promise<ClubActionState> {
  const context = await adminContext();
  if (!context) return denied;
  const id = String(formData.get("club_id") ?? "");
  const input = parseAdminClubInput(formData);
  if (!id || !input) return { ok: false, message: "Check the Club information and meeting time." };
  const { data: existing } = await context.db.from("clubs").select("slug,interest_tags").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "This Club no longer exists." };
  const tags = [input.category, ...(existing.interest_tags ?? []).filter((tag) => tag.toLocaleLowerCase() !== input.category.toLocaleLowerCase())].slice(0, 3);
  const { data, error } = await context.db.from("clubs").update({
    name: input.name,
    short_description: input.shortDescription,
    category: input.category,
    interest_tags: tags,
    contact_email: input.contactEmail,
    status: input.status,
    recruiting_status: input.recruitingStatus,
    join_policy: input.joinPolicy,
    active_start_date: input.activeStartDate,
    active_end_date: input.activeEndDate,
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Nothing was saved. Refresh and verify your administrator access." };
  const meetingSaved = await saveMeeting(context.db, id, input.meeting);
  refreshClubPages(id, existing.slug);
  return meetingSaved ? { ok: true, message: `${input.name} was updated.` } : { ok: false, message: "Club information was saved, but the primary meeting update failed." };
}

export async function archiveAdminClub(formData: FormData): Promise<ClubActionState> {
  const context = await adminContext();
  if (!context) return denied;
  const id = String(formData.get("club_id") ?? "");
  const { data, error } = await context.db.from("clubs").update({ status: "archived" }).eq("id", id).select("name,slug").maybeSingle();
  if (error || !data) return { ok: false, message: "The Club could not be archived." };
  refreshClubPages(id, data.slug);
  return { ok: true, message: `${data.name} was archived. Membership and attendance history were preserved.` };
}

export async function deleteAdminClub(formData: FormData): Promise<ClubActionState> {
  const context = await adminContext();
  if (!context) return denied;
  const id = String(formData.get("club_id") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const expected = String(formData.get("club_name") ?? "").trim();
  if (!id || confirmation !== expected) return { ok: false, message: `Type “${expected}” exactly to confirm permanent deletion.` };
  const { data, error } = await context.db.rpc("admin_delete_club", { p_club_id: id });
  if (error || !data) return { ok: false, message: "Delete failed. The Club must be archived first and the Admin Club Management migration must be applied." };
  refreshClubPages();
  return { ok: true, message: `${expected} and all connected Club records were permanently deleted.` };
}
