import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/navigation";
import { isAllowedEmail } from "@/lib/email-access";

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";
const emailOtpTypes = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function failureRedirect(origin: string, recovery: boolean) {
  const target = new URL("/login", origin);
  target.searchParams.set("error", recovery ? "recovery" : "auth");
  if (recovery) target.searchParams.set("mode", "recovery");
  return NextResponse.redirect(target, 303);
}

/** Complete both PKCE code callbacks and token-hash email templates. */
export async function handleAuthCallback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const type = rawType && emailOtpTypes.has(rawType as EmailOtpType) ? rawType as EmailOtpType : null;
  const recovery = type === "recovery" || safeNextPath(url.searchParams.get("next")) === "/reset-password";
  const next = recovery ? "/reset-password" : safeNextPath(url.searchParams.get("next"));

  if (url.searchParams.has("error") || (!code && !(tokenHash && type))) return failureRedirect(url.origin, recovery);

  const supabase = await createServerClient();
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (result.error) return failureRedirect(url.origin, recovery);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return failureRedirect(url.origin, recovery);
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", url.origin), 303);
  }

  const destination = new URL(next, url.origin);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
