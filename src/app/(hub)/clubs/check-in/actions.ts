"use server";

import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";

export type CheckInState = { ok: boolean; message: string; activity?: string | null; clubSlug?: string | null } | null;

export async function checkIn(_previous: CheckInState, formData: FormData): Promise<CheckInState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in with your student account before checking in." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Check-in is not available yet." };
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return { ok: false, message: "Enter the 8-character code shown by your Club organizer." };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("check_in_to_club", { p_code: code });
  const result = data?.[0];
  if (error || !result) return { ok: false, message: "Check-in could not be completed. Please ask the organizer to verify the code." };
  return { ok: ["checked_in", "already_checked_in"].includes(result.result), message: result.message, activity: result.session_label, clubSlug: result.club_slug };
}
