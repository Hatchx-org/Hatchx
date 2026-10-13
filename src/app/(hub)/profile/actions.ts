"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

export type SoNumberState = { ok: boolean; message: string } | null;

export async function saveSoNumber(_previous: SoNumberState, formData: FormData): Promise<SoNumberState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in before updating your profile." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Profile updates are not available yet." };

  const soNumber = String(formData.get("so_number") ?? "").trim();
  if (soNumber.length > 50 || /[\r\n\u0000-\u001f\u007f]/.test(soNumber)) {
    return { ok: false, message: "SO number must be a single line of 50 characters or fewer." };
  }

  const db = await createServerClient();
  const { error } = await db.from("profiles").update({ so_number: soNumber || null }).eq("id", user.id);
  if (error) return { ok: false, message: "SO number could not be saved. Apply the latest Supabase SQL first." };

  revalidatePath("/profile");
  return { ok: true, message: soNumber ? "SO number saved." : "SO number removed." };
}
