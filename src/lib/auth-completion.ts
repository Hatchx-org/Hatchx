import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/email-access";
import { safeNextPath } from "@/lib/navigation";
import { profileCompletionPath, studentProfileNeedsCompletion } from "@/lib/profile-completion";

/** Validate an established session, enforce student onboarding, then restore its destination. */
export async function completeAuthentication(request: Request) {
  const url = new URL(request.url);
  const db = await createServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/login?error=auth", url.origin), 303);
  if (!isAllowedEmail(user.email)) {
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", url.origin), 303);
  }
  const next = safeNextPath(url.searchParams.get("next"));
  const { data: profile } = await db.from("profiles").select("role, osis_number, grade_level").eq("id", user.id).maybeSingle();
  const destination = studentProfileNeedsCompletion(profile) ? profileCompletionPath(next) : next;
  const response = NextResponse.redirect(new URL(destination, url.origin), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
