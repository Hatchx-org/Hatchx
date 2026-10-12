/** Chromium caps persistent cookies at 400 days. Refresh tokens renew access tokens inside this window. */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
export const REMEMBER_DEVICE_COOKIE = "bayside-remember-device";

export function authCookieLifetime(remember: boolean, deleting = false) {
  return deleting ? 0 : remember ? AUTH_COOKIE_MAX_AGE_SECONDS : undefined;
}

export function rememberDeviceCookie(remember: boolean) {
  document.cookie = `${REMEMBER_DEVICE_COOKIE}=${remember ? "1" : "0"}; Path=/; SameSite=Lax${remember ? `; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}` : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function isRememberedDevice() {
  return typeof document !== "undefined" && document.cookie.split("; ").includes(`${REMEMBER_DEVICE_COOKIE}=1`);
}

export const authCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
};

export const persistentBrowserAuth = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};
