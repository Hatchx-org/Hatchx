import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!isSupabaseConfigured()) return new Response("Club database is unavailable", { status: 503 });

  const { id } = await params;
  const supabase = await createServerClient();
  const access = await supabase.rpc("can_manage_club", { p_club_id: id });
  if (access.error || !access.data) return new Response("Club management access required", { status: 403 });

  const [{ data: club }, { data: records, error }] = await Promise.all([
    supabase.from("clubs").select("name").eq("id", id).maybeSingle(),
    supabase.rpc("get_club_attendance_records", { p_club_id: id, p_limit: 10000 }),
  ]);
  if (!club || error) return new Response("Attendance records could not be exported", { status: 500 });

  const lines = [
    ["Activity", "Member", "Checked in at"].map(csvCell).join(","),
    ...(records ?? []).map((record) => [record.session_label, record.member_name, record.checked_in_at].map(csvCell).join(",")),
  ];
  const filename = `${club.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "club"}-attendance.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
