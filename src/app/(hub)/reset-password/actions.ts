"use server";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

/** A reset link must establish a verified Supabase session before password writes. */
export async function updatePassword(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "The reset session has expired. Request a new reset email." };
  const password = String(form.get("password") ?? "");
  if (password.length < 12 || password.length > 128 || password !== form.get("confirm_password")) return { ok: false, message: "Passwords must match and contain 12–128 characters." };
  const db = await createServerClient();
  const { error } = await db.auth.updateUser({ password });
  if (error) return { ok: false, message: "Password was not changed. Use a new password, or request a fresh reset link." };
  const { error: signOutError } = await db.auth.signOut({ scope: "others" });
  return { ok: true, message: signOutError ? "Password changed. Other sessions could not be revoked; contact Support if you suspect unauthorized access." : "Password changed. Other sessions have been signed out. You can now return to your profile." };
}
