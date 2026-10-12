import { createBrowserClient as createClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";
import type { Database } from "./types";
import { authCookieOptions, authCookieLifetime, isRememberedDevice, persistentBrowserAuth } from "./auth-session";

let browserClient: ReturnType<typeof createClient<Database>> | undefined;

export function createBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    isSingleton: false,
    cookieOptions: authCookieOptions,
    auth: persistentBrowserAuth,
    cookies: {
      getAll() {
        return document.cookie.split("; ").filter(Boolean).map((part) => {
          const separator = part.indexOf("=");
          try { return { name: decodeURIComponent(part.slice(0, separator)), value: decodeURIComponent(part.slice(separator + 1)) }; }
          catch { return { name: part.slice(0, separator), value: part.slice(separator + 1) }; }
        });
      },
      setAll(items) {
        const remember = isRememberedDevice();
        for (const { name, value, options } of items) {
          const deleting = options?.maxAge === 0;
          const lifetime = authCookieLifetime(remember, deleting);
          document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${lifetime === undefined ? "" : `; Max-Age=${lifetime}`}${location.protocol === "https:" ? "; Secure" : ""}`;
        }
      },
    },
  });
  return browserClient;
}
