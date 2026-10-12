import { headers } from "next/headers";
import type { createServerClient } from "@/lib/supabase/server";

export type RateLimitScope = "search_api" | "analytics_api" | "error_report" | "support_submit" | "announcement_submit" | "event_registration" | "membership_action" | "club_application";
type Db = Awaited<ReturnType<typeof createServerClient>>;

function forwardedClient(value: string | null) {
  return value?.split(",")[0]?.trim().slice(0, 100) ?? "";
}

export async function requestIdentifier(request?: Request) {
  const source = request?.headers ?? await headers();
  const address = forwardedClient(source.get("x-forwarded-for")) || source.get("x-real-ip")?.slice(0, 100) || "unknown-client";
  const agent = source.get("user-agent")?.slice(0, 160) ?? "unknown-agent";
  return `${address}|${agent}`;
}

export async function checkRateLimit(db: Db, scope: RateLimitScope, request?: Request) {
  const { data, error } = await db.rpc("check_rate_limit", { p_scope: scope, p_identifier: await requestIdentifier(request) });
  // Fail closed for write-heavy abuse targets when the migration exists but the check fails.
  return { allowed: !error && data === true, unavailable: Boolean(error) };
}
