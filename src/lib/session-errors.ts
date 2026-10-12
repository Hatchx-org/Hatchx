/** A network outage must not erase a valid refresh token and force a new login. */
export function shouldClearAuthCookies(error: { name?: string; code?: string; status?: number }) {
  return error.name === "AuthSessionMissingError" ||
    ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "bad_jwt"].includes(error.code ?? "");
}
