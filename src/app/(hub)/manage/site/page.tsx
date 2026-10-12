import { getSiteText, siteContentSections } from "@/lib/site-content";
import { createServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import SiteTextForm from "./form";
import NoticeSettingsForm from "./notice-settings-form";

export default async function SiteEditorPage() {
  const user = await requirePermission("site.manage", "/manage/site");
  const db = await createServerClient();
  const [{ data: cmsMarker, error }, { data: drafts }, { data: schedules }, { data: versions }] = await Promise.all([
    db.from("site_content").select("key").eq("key", "site_name").maybeSingle(),
    db.from("site_content_drafts").select("*").eq("user_id", user.id),
    db.from("site_content_scheduled").select("*").order("publish_at"),
    db.from("site_content_versions").select("*").order("changed_at", { ascending: false }).limit(250),
  ]);
  const draftMap = new Map((drafts ?? []).map((row) => [row.key, row]));
  const scheduleMap = new Map((schedules ?? []).map((row) => [row.key, row]));
  const versionMap = new Map<string, typeof versions>();
  for (const row of versions ?? []) {
    const list = versionMap.get(row.key) ?? [];
    if (list.length < 5) { list.push(row); versionMap.set(row.key, list); }
  }
  const text = await getSiteText();
  const otherSections = siteContentSections.filter((section) => section.title !== "Top school notice");
  return <div className="mx-auto max-w-5xl space-y-8 px-5 py-8 text-ink"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-powder">Administration</p><h1 className="mt-2 text-3xl font-bold">Public content</h1><p className="mt-2 max-w-3xl text-muted">Edit the school notice and other public page content.</p></div>{error || !cmsMarker ? <p role="alert" className="rounded-card border border-orange/40 bg-card p-5">Apply <code>site_cms_content.sql</code> and the earlier content migrations before using this editor.</p> : <><NoticeSettingsForm enabled={text.school_notice_enabled === "true"} text={text.school_notice_text} background={text.school_notice_background} textColor={text.school_notice_text_color} />{otherSections.map(section => <section key={section.title} aria-labelledby={`section-${section.title.replaceAll(" ", "-").toLowerCase()}`}><div className="mb-4"><h2 id={`section-${section.title.replaceAll(" ", "-").toLowerCase()}`} className="text-xl font-bold">{section.title}</h2><p className="mt-1 text-sm text-muted">{section.description}</p></div><div className="grid gap-4 lg:grid-cols-2">{section.fields.map(field => <SiteTextForm key={field.key} field={field.key} value={text[field.key]} label={field.label} help={field.help} rows={field.rows} optional={field.optional} control={field.control} draft={draftMap.get(field.key)} schedule={scheduleMap.get(field.key)} versions={versionMap.get(field.key) ?? []} />)}</div></section>)}</>}</div>;
}
