import { getCurrentUser } from "@/lib/auth";
import { parseAuditSearch, type AuditSearch } from "@/lib/audit-query";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (user.role !== "admin") return new Response("Administrator access required", { status: 403 });
  if (!isSupabaseConfigured()) return new Response("Audit database is unavailable", { status: 503 });

  const params = Object.fromEntries(new URL(request.url).searchParams) as AuditSearch;
  const filters = parseAuditSearch(params);
  if ("error" in filters) return new Response(filters.error, { status: 400 });
  const db = await createServerClient();
  let actorId = filters.actor;
  if (actorId.includes("@")) {
    const profile = await db.from("profiles").select("id").eq("email", actorId.toLowerCase()).maybeSingle();
    if (profile.error || !profile.data) return new Response("Actor could not be resolved", { status: 400 });
    actorId = profile.data.id;
  }

  if (filters.kind === "roles") {
    let query = db.from("account_role_audit").select("*").order("created_at", { ascending: false }).limit(5000);
    if (actorId) query = query.eq("actor_id", actorId);
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.until) query = query.lt("created_at", filters.until);
    const result = await query;
    if (result.error) return new Response("Audit export failed", { status: 500 });
    const rows = [["timestamp", "actor_id", "profile_id", "previous_role", "new_role", "club_id"], ...(result.data ?? []).map(row => [row.created_at, row.actor_id, row.profile_id, row.previous_role, row.new_role, row.club_id])];
    return csvResponse(rows, "account-role-audit.csv");
  }

  let query = db.from("management_audit").select("*").order("created_at", { ascending: false }).limit(5000);
  if (actorId) query = query.eq("actor_id", actorId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.until) query = query.lt("created_at", filters.until);
  if (filters.resource) query = query.eq("resource", filters.resource);
  if (filters.operation) query = query.eq("operation", filters.operation);
  if (filters.q) query = query.textSearch("search_vector", filters.q, { config: "simple", type: "websearch" });
  const result = await query;
  if (result.error) return new Response("Audit export failed", { status: 500 });
  const rows = [["timestamp", "actor_id", "resource", "operation", "before", "after"], ...(result.data ?? []).map(row => [row.created_at, row.actor_id, row.resource, row.operation, row.before_data, row.after_data])];
  return csvResponse(rows, "platform-change-audit.csv");
}

function csvResponse(rows: unknown[][], filename: string) {
  const body = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
