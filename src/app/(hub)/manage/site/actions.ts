"use server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";
import { siteTextDefaults } from "@/lib/site-content";
import { revalidatePath } from "next/cache";

async function siteEditor() {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await createServerClient();
  return await hasPermission("site.manage") ? { user, db } : null;
}

export async function saveSiteDraft(key: string, body: string) {
  const context = await siteEditor();
  if (!context) return "You do not have permission to edit public content.";
  if (!Object.hasOwn(siteTextDefaults, key) || body.length > 4000) return "Draft is too long or uses an unknown field.";
  const { error } = await context.db.from("site_content_drafts").upsert({ user_id: context.user.id, key, body, updated_at: new Date().toISOString() });
  return error ? "Draft could not be saved. Apply supabase/schema.sql." : "Draft saved.";
}

/** Enforce capability on every write, even if an old editor tab stays open. */
export async function saveSiteText(_state: string, form: FormData) {
  const context = await siteEditor();
  if (!context) return "You do not have permission to edit public content.";
  const key = String(form.get("key") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const optionalKeys = new Set(["footer_contact", "support_location", "school_notice_text"]);
  if (!Object.hasOwn(siteTextDefaults, key) || (!body && !optionalKeys.has(key)) || body.length > 4000) return "Enter 1–4,000 characters in a supported field; optional fields may be blank.";
  if (["school_notice_background", "school_notice_text_color"].includes(key) && !/^#[0-9a-f]{6}$/i.test(body)) return "Enter a six-digit hex color, such as #ff8500.";
  if (key === "school_notice_enabled" && !["true", "false"].includes(body)) return "Choose whether the notice is on or off.";
  const rawTime = String(form.get("publish_at") ?? "");
  const publishAt = rawTime ? new Date(rawTime) : null;
  if (publishAt && Number.isNaN(publishAt.getTime())) return "Enter a valid publication time.";
  const scheduled = publishAt && publishAt.getTime() > Date.now();
  const { error } = scheduled
    ? await context.db.from("site_content_scheduled").upsert({ key, body, publish_at: publishAt.toISOString(), updated_by: context.user.id, updated_at: new Date().toISOString() })
    : await context.db.from("site_content").upsert({ key, body, updated_by: context.user.id, updated_at: new Date().toISOString() });
  if (error) return "Unable to save. Check database setup and your permissions.";
  if (!scheduled) await context.db.from("site_content_scheduled").delete().eq("key", key);
  await context.db.from("site_content_drafts").delete().eq("user_id", context.user.id).eq("key", key);
  revalidatePath("/", "layout");
  return scheduled ? "Scheduled. Public text will change at the selected time." : "Saved. Public pages now use this text.";
}

export async function saveSchoolNotice(_state: string, form: FormData) {
  const context = await siteEditor();
  if (!context) return "You do not have permission to edit public content.";

  const enabled = form.get("enabled") === "on" ? "true" : "false";
  const text = String(form.get("text") ?? "").trim();
  const background = String(form.get("background") ?? "").trim();
  const textColor = String(form.get("text_color") ?? "").trim();
  if (text.length > 4000) return "Notice text must be 4,000 characters or fewer.";
  if (![background, textColor].every((color) => /^#[0-9a-f]{6}$/i.test(color))) {
    return "Enter six-digit hex colors, such as #ff8500.";
  }

  const updatedAt = new Date().toISOString();
  const rows = [
    { key: "school_notice_enabled", body: enabled, updated_by: context.user.id, updated_at: updatedAt },
    { key: "school_notice_text", body: text, updated_by: context.user.id, updated_at: updatedAt },
    { key: "school_notice_background", body: background, updated_by: context.user.id, updated_at: updatedAt },
    { key: "school_notice_text_color", body: textColor, updated_by: context.user.id, updated_at: updatedAt },
  ];
  const { error } = await context.db.from("site_content").upsert(rows);
  if (error) return "Unable to save. Apply supabase/schema.sql and check your permissions.";

  const keys = rows.map((row) => row.key);
  await Promise.all([
    context.db.from("site_content_scheduled").delete().in("key", keys),
    context.db.from("site_content_drafts").delete().eq("user_id", context.user.id).in("key", keys),
  ]);
  revalidatePath("/", "layout");
  return enabled === "true" ? "Saved. The notice is now visible." : "Saved. The notice is turned off, and its content is preserved.";
}

export async function restoreSiteTextVersion(_state: string, form: FormData) {
  const context = await siteEditor();
  if (!context) return "You do not have permission to edit public content.";
  if (form.get("confirm") !== "yes") return "Confirm restoration first.";
  const key = String(form.get("key") ?? "");
  const id = String(form.get("version_id") ?? "");
  if (!Object.hasOwn(siteTextDefaults, key)) return "Unknown field.";
  const { data: version } = await context.db.from("site_content_versions").select("snapshot_body").eq("id", id).eq("key", key).maybeSingle();
  if (!version) return "Version not found.";
  const { error } = await context.db.from("site_content").upsert({ key, body: version.snapshot_body, updated_by: context.user.id, updated_at: new Date().toISOString() });
  if (error) return "Could not restore this version.";
  await context.db.from("site_content_scheduled").delete().eq("key", key);
  await context.db.from("site_content_drafts").delete().eq("user_id", context.user.id).eq("key", key);
  revalidatePath("/", "layout");
  return "Restored. This version is live now.";
}
