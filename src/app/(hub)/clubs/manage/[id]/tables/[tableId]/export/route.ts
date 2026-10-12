import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

function csv(value: unknown) {
  let text = value == null ? "" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; tableId: string }> }) {
  const { id, tableId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club_forms", { p_club_id: id });
  if (!access.data) return new Response("Not authorized", { status: 403 });
  const table = await db.from("club_custom_tables").select("*").eq("id", tableId).eq("club_id", id).maybeSingle();
  if (!table.data) return new Response("Table not found", { status: 404 });
  const rows: Array<{ created_at: string; data: Record<string, string | number | boolean> }> = [];
  for (let from = 0; from < 10000; from += 1000) {
    const page = await db.from("club_custom_table_rows").select("created_at,data").eq("table_id", tableId).order("created_at").range(from, from + 999);
    if (page.error) return new Response("Export failed", { status: 500 });
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const header = ["Recorded at", ...table.data.columns.map(column => column.label)].map(csv).join(",");
  const body = rows.map(row => [row.created_at, ...table.data!.columns.map(column => row.data[column.key])].map(csv).join(","));
  const filename = table.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "club-table";
  return new Response(`\uFEFF${[header, ...body].join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"`, "Cache-Control": "private, no-store" } });
}
