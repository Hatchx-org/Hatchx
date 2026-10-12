import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deliverClubInvitationEmail } from "@/lib/club-invitation-email";
import type { ClubInvitationEmailOutboxRow, Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Database delivery worker is not configured" }, { status: 503 });
  const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const claimed = await db.rpc("claim_club_invitation_emails", { p_limit: 25 });
  if (claimed.error) return NextResponse.json({ error: "Invitation email queue is unavailable" }, { status: 503 });
  const results = await Promise.all((claimed.data ?? []).map((message) => deliver(db, message)));
  return NextResponse.json({ claimed: results.length, sent: results.filter(Boolean).length }, { headers: { "Cache-Control": "no-store" } });
}

async function deliver(db: ReturnType<typeof createClient<Database>>, message: ClubInvitationEmailOutboxRow) {
  const result = await deliverClubInvitationEmail(message);
  if (result.ok) {
    await db.from("club_invitation_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: result.providerId, last_error: null }).eq("id", message.id);
    return true;
  }
  const terminal = !result.retryable || message.attempts >= 5;
  await db.from("club_invitation_email_outbox").update({ status: terminal ? "cancelled" : "failed", available_at: new Date(Date.now() + Math.min(60, 5 * 2 ** message.attempts) * 60_000).toISOString(), last_error: result.error.slice(0, 500) }).eq("id", message.id);
  return false;
}
