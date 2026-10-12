"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { parseClubTags } from "@/lib/club-profile-input";
import { createServerClient } from "@/lib/supabase/server";

export async function updateClubTags(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return { ok: false, message: "Admin access required." };
  const clubId = String(formData.get("club_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const tags = parseClubTags(formData.getAll("interest_tags"));
  if (!clubId || !tags) return { ok: false, message: "Add 1–3 unique tags. Each tag must be 2–30 characters." };

  const db = await createServerClient();
  const { data, error } = await db.from("clubs").update({ interest_tags: tags }).eq("id", clubId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Tags were not saved. Check database permissions and try again." };

  revalidatePath("/admin/clubs/tags");
  revalidatePath("/clubs", "layout");
  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/clubs/quiz");
  revalidatePath("/search");
  return { ok: true, message: "Club tags updated." };
}
