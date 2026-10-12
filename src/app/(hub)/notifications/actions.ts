"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

function refreshNotifications() {
  revalidatePath("/");
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await createServerClient();
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null).is("deleted_at", null);
  refreshNotifications();
}

export async function bulkNotificationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const ids = [...new Set(formData.getAll("notification_id").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
  if (!ids.length) return;
  const operation = String(formData.get("operation") ?? "");
  const db = await createServerClient();
  if (operation === "delete") await db.from("notifications").delete().eq("user_id", user.id).in("id", ids);
  if (operation === "read") await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).in("id", ids);
  if (operation === "unread") await db.from("notifications").update({ read_at: null }).eq("user_id", user.id).in("id", ids);
  refreshNotifications();
}
