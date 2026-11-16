import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false }, { status: 503, headers: responseHeaders });
  }

  const db = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await db.from("site_content").select("key", { head: true }).limit(1);

  if (error) {
    return Response.json({ ok: false }, { status: 503, headers: responseHeaders });
  }

  return Response.json({ ok: true }, { headers: responseHeaders });
}
