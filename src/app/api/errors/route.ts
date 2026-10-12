import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required" }, { status: 415 });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site"].includes(fetchSite)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const db = await createServerClient();
  const limit = await checkRateLimit(db, "error_report", request);
  if (!limit.allowed) return NextResponse.json({ error: limit.unavailable ? "Monitoring unavailable" : "Too many reports" }, { status: limit.unavailable ? 503 : 429 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const source = String(body.source ?? "client-boundary").replace(/[^a-z0-9:_-]/gi, "-").slice(0, 80);
  const message = String(body.message ?? "Client error").slice(0, 1000);
  const route = String(body.route ?? "").split("?")[0].slice(0, 300);
  const digest = String(body.digest ?? "").slice(0, 160);
  const { error } = await db.rpc("record_system_error", { p_source: source, p_message: message, p_context: { route, digest, kind: "client" } });
  return error ? NextResponse.json({ error: "Monitoring unavailable" }, { status: 503 }) : new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
