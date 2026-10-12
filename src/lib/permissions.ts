import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export const teacherPermissions = [
  "announcements.manage",
  "opportunities.manage",
  "events.manage",
  "support.manage",
  "site.manage",
] as const;

export type TeacherPermission = (typeof teacherPermissions)[number];

export async function hasPermission(permission: TeacherPermission) {
  const user = await getCurrentUser();
  if (!user) return false;
  if (["staff", "admin"].includes(user.role)) return true;
  if (user.role !== "teacher") return false;
  const db = await createServerClient();
  const { data } = await db.rpc("has_teacher_permission", { p_permission: permission });
  return data === true;
}

export async function hasAnyTeacherPermission() {
  const user = await getCurrentUser();
  if (!user) return false;
  if (["staff", "admin"].includes(user.role)) return true;
  if (user.role !== "teacher") return false;
  const db = await createServerClient();
  const { data } = await db.rpc("has_any_teacher_permission");
  return data === true;
}

export async function requirePermission(permission: TeacherPermission, next = "/admin") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await hasPermission(permission))) redirect("/");
  return user;
}
