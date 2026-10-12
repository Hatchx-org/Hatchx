import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET(request: NextRequest) {
  await requireAdmin();
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const db = await createServerClient();
  const result = await db.from("analytics_events").select("event_name,route,entity_id,metric_value,metadata,user_id,session_id,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50000);
  const lines = [["event_name","route","entity_id","metric_value","device","user_id","session_id","created_at"].map(csv).join(","), ...(result.data ?? []).map(row => [row.event_name,row.route,row.entity_id,row.metric_value,(row.metadata as Record<string,unknown>)?.device,row.user_id,row.session_id,row.created_at].map(csv).join(","))];
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bayside-analytics-${days}d.csv"`, "cache-control": "no-store" } });
}
