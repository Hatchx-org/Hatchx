import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database, PushDeliveryClaim } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !serviceKey || !publicKey || !privateKey || !subject) return NextResponse.json({ error: "Push delivery is not configured" }, { status: 503 });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("claim_push_deliveries", { p_limit: 50 });
  if (error) return NextResponse.json({ error: "Push queue is unavailable" }, { status: 503 });

  const results = await Promise.all((data ?? []).map((item) => deliver(db, item)));
  return NextResponse.json({ claimed: results.length, sent: results.filter(Boolean).length }, { headers: { "Cache-Control": "no-store" } });
}

async function deliver(db: ReturnType<typeof createClient<Database>>, item: PushDeliveryClaim) {
  try {
    await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify({ id: item.notification_id, title: item.title, body: item.body, href: item.href ?? "/notifications", kind: item.kind }), { TTL: item.kind === "emergency_announcement" ? 86_400 : 21_600, urgency: item.kind === "emergency_announcement" ? "high" : "normal" });
    await db.from("push_notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", item.delivery_id);
    return true;
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if ([404, 410].includes(statusCode)) {
      await db.from("push_subscriptions").delete().eq("id", item.subscription_id);
    } else {
      await db.from("push_notification_deliveries").update({ status: "failed", available_at: new Date(Date.now() + 5 * 60_000).toISOString(), last_error: error instanceof Error ? error.message.slice(0, 500) : "Push delivery failed" }).eq("id", item.delivery_id);
    }
    return false;
  }
}
