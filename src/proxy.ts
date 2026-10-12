import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAllowedEmail } from "@/lib/email-access";
import { safeNextPath } from "@/lib/navigation";

function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  // Preserve refreshed auth cookies when turning the response into a redirect.
  const redirectResponse = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (!isSupabaseConfigured()) return response;

  const { pathname } = request.nextUrl;
  const allowedUser = user && isAllowedEmail(user.email) ? user : null;

  const isProtected = pathname.startsWith("/profile");
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname.startsWith("/login");

  // This is an early navigation guard, not the security boundary. Pages,
  // Server Actions, and RLS still perform authoritative permission checks.
  if (isAdmin || isProtected) {
    if (!allowedUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return redirectWithSession(url, response);
    }
  }

  if (isLogin && allowedUser) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/");
    return redirectWithSession(new URL(next, request.url), response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
