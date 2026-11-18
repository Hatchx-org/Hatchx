export type AuthErrorLike = { status?: number; code?: string; message?: string; name?: string };

export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3600, Math.ceil(seconds));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(3600, Math.max(0, Math.ceil((date - now) / 1000)));
}

export function isAuthRateLimitError(error: AuthErrorLike | null | undefined) {
  return error?.status === 429 || error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit";
}

export function authFailureMessage(error: AuthErrorLike | null | undefined, retryAfterSeconds: number | null, operation: "signin" | "signup" | "recovery" | "google") {
  if (isAuthRateLimitError(error)) {
    const wait = retryAfterSeconds && retryAfterSeconds > 0
      ? ` Wait ${retryAfterSeconds < 60 ? `${retryAfterSeconds} seconds` : `${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? "s" : ""}`} before trying again.`
      : " Wait a few minutes before trying again.";
    return `Too many sign-in requests are coming from this network.${wait} Your information and destination have been kept.`;
  }
  if (error?.code === "captcha_failed") return "The security check expired or could not be verified. Complete the new check and try once more.";
  if (operation === "signin") return "Sign-in failed. Check your email and password, and confirm your email first.";
  if (operation === "recovery") return "Unable to send the recovery email. Try again later or contact Support.";
  if (operation === "google") return "Google sign-in could not complete. Try email sign-in or contact Support.";
  return "Registration could not complete. Check your information or contact Support.";
}

/** Structured diagnostics intentionally exclude email, password, OSIS, tokens, and destinations. */
export function authFailureLog(operation: string, error: AuthErrorLike | null | undefined, retryAfterSeconds: number | null) {
  return {
    event: "auth_failure",
    operation,
    status: error?.status ?? null,
    code: error?.code ?? error?.name ?? "unknown",
    retry_after_seconds: retryAfterSeconds,
  };
}
