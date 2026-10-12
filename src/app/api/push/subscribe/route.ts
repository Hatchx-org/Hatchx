import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

function sameSite(request: Request) {
  const value = request.headers.get("sec-fetch-site");
  return !value || value === "same-origin" || value === "same-site";
}

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const trustedProvider = hostname === "fcm.googleapis.com"
      || hostname === "push.services.mozilla.com"
      || hostname.endsWith(".push.services.mozilla.com")
      || hostname === "notify.windows.com"
      || hostname.endsWith(".notify.windows.com")
      || hostname === "web.push.apple.com"
      || hostname.endsWith(".push.apple.com");
    return url.protocol === "https:" && trustedProvider;
  } catch { return false; }
}

function expirationDate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!sameSite(request)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body: { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.slice(0, 2000) : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.slice(0, 500) : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth.slice(0, 200) : "";
  if (!validEndpoint(endpoint) || p256dh.length < 20 || auth.length < 8) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const expiresAt = expirationDate(body.expirationTime);
  const db = await createServerClient();
  const [{ count }, { data: existing }] = await Promise.all([
    db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("push_subscriptions").select("id").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle(),
  ]);
  if (!existing && (count ?? 0) >= 10) return NextResponse.json({ error: "Too many registered devices" }, { status: 429 });
  const { error } = await db.from("push_subscriptions").upsert({ user_id: user.id, endpoint, p256dh, auth, expires_at: expiresAt, user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  return error ? NextResponse.json({ error: "Push subscriptions are not available yet" }, { status: 503 }) : new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!sameSite(request)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let endpoint = "";
  try { endpoint = String((await request.json() as { endpoint?: unknown }).endpoint ?? "").slice(0, 2000); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const db = await createServerClient();
  const { error } = await db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  return error ? NextResponse.json({ error: "Could not disable push" }, { status: 503 }) : new Response(null, { status: 204 });
}
