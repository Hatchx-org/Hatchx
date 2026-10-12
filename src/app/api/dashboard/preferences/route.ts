import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dashboardCardIds, type DashboardCardId } from "@/lib/student-dashboard-data";
import { createServerClient } from "@/lib/supabase/server";

function validCards(value: unknown): DashboardCardId[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(dashboardCardIds);
  const cards = value.filter((item): item is DashboardCardId => typeof item === "string" && allowed.has(item));
  return cards.length === value.length && new Set(cards).size === cards.length ? cards : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site"].includes(fetchSite)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required" }, { status: 415 });
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const cardOrder = validCards(payload.cardOrder);
  const hiddenCards = validCards(payload.hiddenCards);
  if (!cardOrder || !hiddenCards || cardOrder.length !== dashboardCardIds.length) return NextResponse.json({ error: "Invalid dashboard layout" }, { status: 400 });
  const db = await createServerClient();
  const { error } = await db.from("dashboard_preferences").upsert({ user_id: user.id, card_order: cardOrder, hidden_cards: hiddenCards, updated_at: new Date().toISOString() });
  return error ? NextResponse.json({ error: "Preferences are not available yet" }, { status: 503 }) : new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
