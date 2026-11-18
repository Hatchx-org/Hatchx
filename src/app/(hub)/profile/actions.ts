"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";
import { normalizeGrade, normalizeOsis } from "@/lib/student-registration";

export type ProfileState = { ok: boolean; message: string } | null;

export async function saveProfile(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in before updating your profile." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Profile updates are not available yet." };

  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const soNumber = String(formData.get("so_number") ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120 || /[\r\n\u0000-\u001f\u007f]/.test(fullName)) {
    return { ok: false, message: "Full name must be 2–120 characters on one line." };
  }
  if (soNumber.length > 50 || /[\r\n\u0000-\u001f\u007f]/.test(soNumber)) {
    return { ok: false, message: "SO number must be a single line of 50 characters or fewer." };
  }

  const db = await createServerClient();
  const osis = user.role === "student" ? normalizeOsis(String(formData.get("osis_number") ?? "")) : null;
  const grade = user.role === "student" ? normalizeGrade(String(formData.get("grade_level") ?? "")) : null;
  if (user.role === "student" && (!osis || !grade)) return { ok: false, message: "Students must enter a valid 9-digit OSIS number and select grade 9–12." };
  const { error } = await db.rpc("update_my_profile", { p_full_name: fullName, p_osis_number: osis, p_grade_level: grade, p_so_number: soNumber || null });
  if (error?.code === "23505") return { ok: false, message: "That OSIS number is already connected to another account. Contact Support." };
  if (error) return { ok: false, message: "Profile could not be saved. Ask an administrator to apply the latest Supabase migration." };

  revalidatePath("/profile");
  const nextValue = formData.get("next");
  if (typeof nextValue === "string" && nextValue) redirect(safeNextPath(nextValue));
  return { ok: true, message: "Profile saved." };
}
