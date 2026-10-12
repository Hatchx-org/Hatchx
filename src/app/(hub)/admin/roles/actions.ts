"use server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
const permissions = ["clubs.manage", "clubs.govern", "site.manage"];
export async function manageCustomRole(_state: string, form: FormData) {
  await requireAdmin();
  const db = await createServerClient();
  const operation = String(form.get("operation"));
  let error;
  if (operation === "create" || operation === "update") {
    const name = String(form.get("name") ?? "").trim();
    const selected = form.getAll("permissions").map(String);
    if (name.length < 2 || name.length > 60 || selected.some(value => !permissions.includes(value))) return "Choose a name and valid permissions.";
    if (operation === "create") ({ error } = await db.from("custom_roles").insert({ name, permissions: selected }));
    else ({ error } = await db.from("custom_roles").update({ name, permissions: selected }).eq("id", String(form.get("id"))));
  } else if (operation === "assign") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) return "No registered account found for that email.";
    ({ error } = await db.from("custom_role_assignments").insert({ profile_id: profile.id, role_id: String(form.get("role_id")), club_id: String(form.get("club_id") ?? "") || null }));
  } else if (operation === "revoke") {
    ({ error } = await db.from("custom_role_assignments").delete().eq("id", String(form.get("id"))));
  } else if (operation === "delete") {
    if (form.get("confirm") !== "yes") return "Confirm that all assignments should be revoked.";
    ({ error } = await db.from("custom_roles").delete().eq("id", String(form.get("id"))));
  } else return "Unknown operation.";
  if (error) return "Change could not be saved. Check for duplicate names or assignments and verify database setup.";
  revalidatePath("/admin/roles");
  revalidatePath("/clubs/manage");
  return "Saved. Permissions take effect on the next request.";
}
