"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export async function publishNotification(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Administrator permission required." };
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const href = String(formData.get("href") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all");
  const clubId = String(formData.get("club_id") ?? "");
  if (title.length < 3 || title.length > 160 || body.length < 3 || body.length > 2000) {
    return { ok: false, message: "Use a 3–160 character title and a 3–2,000 character message." };
  }
  if (href && (!href.startsWith("/") || href.startsWith("//") || href.length > 500)) {
    return { ok: false, message: "The optional link must be a local path such as /calendar." };
  }
  if (!["all", "students", "teachers", "admins", "club"].includes(audience) || (audience === "club" && !clubId)) {
    return { ok: false, message: "Choose a valid audience and Club." };
  }
  const db = await createServerClient();
  const { data, error } = await db.rpc("publish_admin_notification", {
    p_title: title,
    p_body: body,
    p_href: href || null,
    p_audience: audience,
    p_club_id: audience === "club" ? clubId : null,
    p_emergency: formData.get("emergency") === "on",
  });
  if (error) return ["42883", "PGRST202"].includes(error.code ?? "")
    ? { ok: false, message: "Apply supabase/admin-notifications-board-order.sql, then try again." }
    : { ok: false, message: "Notification could not be published." };
  revalidatePath("/");
  revalidatePath("/notifications");
  return { ok: true, message: `Notification published to ${data ?? 0} account${data === 1 ? "" : "s"}.` };
}
