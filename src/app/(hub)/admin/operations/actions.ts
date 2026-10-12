"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export async function resolveSystemError(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return;
  const db = await createServerClient();
  await db.from("system_errors").update({ resolved_at: new Date().toISOString() }).eq("id", id).is("resolved_at", null);
  revalidatePath("/admin/operations");
}
