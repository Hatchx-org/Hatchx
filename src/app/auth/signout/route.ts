import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { POST_FORM_REDIRECT_STATUS, safeNextPath } from "@/lib/navigation";
import { REMEMBER_DEVICE_COOKIE } from "@/lib/supabase/auth-session";

export async function POST(request: Request) {
  const supabase = await createServerClient();

  await supabase.auth.signOut({ scope: "local" });

  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"), "/login");

  const response = NextResponse.redirect(
    new URL(next, request.url),
    POST_FORM_REDIRECT_STATUS,
  );
  response.cookies.set(REMEMBER_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
