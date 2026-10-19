import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/email-access";
import { safeNextPath } from "@/lib/navigation";

/** Validate the Google ID-token session before allowing it into Hatchx. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await createServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/login?error=auth", url.origin), 303);
  if (!isAllowedEmail(user.email)) {
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", url.origin), 303);
  }
  const response = NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
