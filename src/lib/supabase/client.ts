import { createBrowserClient as createClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";
import type { Database } from "./types";
import { authCookieOptions, authCookieLifetime, isRememberedDevice, persistentBrowserAuth } from "./auth-session";
import { parseRetryAfter } from "@/lib/auth-errors";

let browserClient: ReturnType<typeof createClient<Database>> | undefined;
let authRetryAfterSeconds: number | null = null;

export function consumeAuthRetryAfterSeconds() {
  const value = authRetryAfterSeconds;
  authRetryAfterSeconds = null;
  return value;
}

async function observedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/auth/v1/") && response.status === 429) authRetryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  return response;
}

export function createBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    isSingleton: false,
    cookieOptions: authCookieOptions,
    global: { fetch: observedFetch },
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
