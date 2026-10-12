import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return new Response(null, { status: 204 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const eventName = String(body.eventName ?? "");
  if (!["page_view", "search_result_click", "LCP", "INP", "CLS"].includes(eventName)) return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  const value = body.value == null ? null : Number(body.value);
  if (value !== null && !Number.isFinite(value)) return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  if (["LCP", "INP", "CLS"].includes(eventName) && (value === null || value < 0 || value > (eventName === "CLS" ? 10 : 60_000))) return NextResponse.json({ error: "Metric out of range" }, { status: 400 });
  const db = await createServerClient();
  const limit = await checkRateLimit(db, "analytics_api", request);
  if (!limit.allowed && !limit.unavailable) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  const inputMetadata = body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {};
  const device = ["mobile", "tablet", "desktop"].includes(String(inputMetadata.device)) ? String(inputMetadata.device) : "unknown";
  const connection = String(inputMetadata.connection ?? "unknown").slice(0, 20);
  await db.rpc("record_analytics_event", { p_event_name: eventName, p_route: String(body.route ?? "").slice(0, 300), p_entity_id: body.entityId ? String(body.entityId).slice(0, 120) : null, p_metric_value: value, p_metadata: { device, connection }, p_session_id: body.sessionId ? String(body.sessionId).slice(0, 80) : null });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
