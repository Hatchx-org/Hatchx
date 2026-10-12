import { createServerClient as createClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";
import type { Database } from "./types";
import { authCookieLifetime, authCookieOptions, REMEMBER_DEVICE_COOKIE } from "./auth-session";

export async function createServerClient() {
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_DEVICE_COOKIE)?.value === "1";

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, maxAge: authCookieLifetime(remember, options?.maxAge === 0) }),
          );
        } catch {
          // Called from a Server Component; token refresh is handled by middleware.
        }
      },
    },
  });
}
