import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { REMEMBER_DEVICE_COOKIE } from "@/lib/supabase/auth-session";
import { POST_FORM_REDIRECT_STATUS } from "@/lib/navigation";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return new Response("Could not sign out all devices. Please return to your profile and try again.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const response = NextResponse.redirect(new URL("/login?signed_out=all", request.url), POST_FORM_REDIRECT_STATUS);
  response.cookies.set(REMEMBER_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
