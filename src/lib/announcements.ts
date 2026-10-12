import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { announcements as seedAnnouncements, type Announcement } from "./data";
import { developmentFallback } from "./live-data";
import type { AnnouncementVersionRow } from "./supabase/types";

export const ANNOUNCEMENTS_PAGE_SIZE = 12;

function toAnnouncement(row: {
  id: string;
  title: string;
  tag: string;
  body: string;
  created_at: string;
  effective_date?: string | null;
  media_id?: string | null;
  priority?: "normal" | "important" | "urgent" | "emergency";
  pinned_until?: string | null;
}, image?: { url: string; alt: string | null }): Announcement {
  const date = row.effective_date ?? row.created_at;
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    date: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date)),
    excerpt: row.body,
    imageUrl: image?.url,
    imageAlt: image?.alt ?? undefined,
    priority: row.priority ?? "normal",
    pinned: Boolean(row.pinned_until && new Date(row.pinned_until).getTime() > Date.now()),
  };
}

async function attachAnnouncementMedia(supabase: Awaited<ReturnType<typeof createServerClient>>, rows: Array<{ media_id?: string | null }>) {
  const ids = [...new Set(rows.map((row) => row.media_id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, { url: string; alt: string | null }>();
  const { data } = await supabase.from("club_media").select("id,storage_path,alt_text").in("id", ids);
  return new Map((data ?? []).map((item) => [item.id, { url: supabase.storage.from("club-media").getPublicUrl(item.storage_path).data.publicUrl, alt: item.alt_text }]));
}

export const getAnnouncements = cache(async (limit = 100, schoolOnly = false): Promise<Announcement[]> => {
  if (!isSupabaseConfigured()) return developmentFallback(seedAnnouncements).slice(0, limit);

  const supabase = await createServerClient();
  const now = new Date().toISOString();
  let query = supabase
    .from("announcements")
    .select("id, title, tag, body, created_at, media_id, priority, pinned_until")
    .eq("published", true)
    .is("archived_at", null)
    .or(`publish_at.is.null,publish_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (schoolOnly) query = query.eq("audience_type", "school");
  let { data: rows, error } = await query
    .order("pinned_until", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error?.code === "42703") { const fallback = await supabase.from("announcements").select("id, title, tag, body, created_at, media_id").eq("published", true).is("archived_at", null).order("created_at", { ascending: false }).limit(limit); rows = fallback.data?.map(row => ({ ...row, priority: "normal" as const, pinned_until: null })) ?? null; error = fallback.error; }

  if (error) throw new Error(`Unable to load announcements: ${error.message}`);
  const media = await attachAnnouncementMedia(supabase, rows ?? []);
  return (rows ?? []).map((row) => toAnnouncement(row, row.media_id ? media.get(row.media_id) : undefined)).slice(0, limit);
});

export const getAnnouncementTags = cache(async (): Promise<string[]> => {
  if (!isSupabaseConfigured()) return Array.from(new Set(developmentFallback(seedAnnouncements).map((a) => a.tag)));
  const supabase = await createServerClient();
  const now = new Date().toISOString();
  let { data, error } = await supabase.from("announcements").select("tag").eq("published", true).is("archived_at", null).or(`publish_at.is.null,publish_at.lte.${now}`).or(`expires_at.is.null,expires_at.gt.${now}`);
  if (error?.code === "42703") ({ data, error } = await supabase.from("announcements").select("tag").eq("published", true).is("archived_at", null));
  if (error) throw new Error(`Unable to load announcement filters: ${error.message}`);
  return Array.from(new Set((data ?? []).map((row) => row.tag))).sort();
});

export const getAnnouncementsPage = cache(async (
  page = 1,
  tag?: string,
  pageSize = ANNOUNCEMENTS_PAGE_SIZE,
  search?: string,
): Promise<{ announcements: Announcement[]; page: number; pageCount: number }> => {
  const safePageSize = Math.max(1, Math.min(pageSize, 50));
  const safePage = Math.max(1, page);
  const safeSearch = search?.normalize("NFKC").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!isSupabaseConfigured()) {
    const filtered = developmentFallback(seedAnnouncements).filter((item) => {
      const matchesTag = !tag || item.tag === tag;
      const haystack = `${item.title} ${item.excerpt} ${item.tag}`.toLocaleLowerCase();
      return matchesTag && (!safeSearch || haystack.includes(safeSearch.toLocaleLowerCase()));
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / safePageSize));
    const start = (Math.min(safePage, pageCount) - 1) * safePageSize;
    return { announcements: filtered.slice(start, start + safePageSize), page: Math.min(safePage, pageCount), pageCount };
  }
  const supabase = await createServerClient();
  let query = supabase.from("announcements").select("id, title, tag, body, created_at, media_id, priority, pinned_until", { count: "exact" }).eq("published", true).is("archived_at", null);
  query = query.or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`);
  query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (tag) query = query.eq("tag", tag);
  if (safeSearch) query = query.or(`title.ilike.%${safeSearch}%,body.ilike.%${safeSearch}%`);
  let { data, count, error } = await query
    .order("pinned_until", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
    .range((safePage - 1) * safePageSize, safePage * safePageSize - 1);
  if (error?.code === "42703") {
    let fallback = supabase.from("announcements").select("id, title, tag, body, created_at, media_id", { count: "exact" }).eq("published", true).is("archived_at", null);
    if (tag) fallback = fallback.eq("tag", tag);
    if (safeSearch) fallback = fallback.or(`title.ilike.%${safeSearch}%,body.ilike.%${safeSearch}%`);
    const result = await fallback.order("created_at", { ascending: false }).range((safePage - 1) * safePageSize, safePage * safePageSize - 1);
    data = result.data?.map(row => ({ ...row, priority: "normal" as const, pinned_until: null })) ?? null; count = result.count; error = result.error;
  }
  if (error) throw new Error(`Unable to load announcements: ${error.message}`);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / safePageSize));
  const media = await attachAnnouncementMedia(supabase, data ?? []);
  return {
    announcements: (data ?? []).map((row) => toAnnouncement(row, row.media_id ? media.get(row.media_id) : undefined)),
    page: Math.min(safePage, pageCount),
    pageCount,
  };
});

export const getArchivedAnnouncements = cache(async (limit = 100, from?: string, to?: string): Promise<Announcement[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createServerClient();
  let query = supabase
    .from("announcements")
    .select("id, title, tag, body, created_at, effective_date, media_id")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(limit);
  if (from) query = query.gte("effective_date", from);
  if (to) query = query.lte("effective_date", to);
  const { data: rows, error } = await query;
  if (error) throw new Error(`Unable to load archived announcements: ${error.message}`);
  const media = await attachAnnouncementMedia(supabase, rows ?? []);
  return (rows ?? []).map((row) => toAnnouncement(row, row.media_id ? media.get(row.media_id) : undefined));
});

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerClient();
    let { data: row, error } = await supabase
      .from("announcements")
      .select("id, title, tag, body, created_at, media_id, publish_at, published, archived_at, priority, pinned_until")
      .eq("id", id)
      .or("published.eq.true,archived_at.not.is.null")
      .maybeSingle();
    if (error?.code === "42703") ({ data: row, error } = await supabase.from("announcements").select("id, title, tag, body, created_at, media_id, published, archived_at").eq("id", id).or("published.eq.true,archived_at.not.is.null").maybeSingle());
    if (error) return null;
    if (row && row.published && !row.archived_at && "publish_at" in row && row.publish_at && new Date(row.publish_at).getTime() > Date.now()) return null;
    if (row) {
      const media = row.media_id ? await attachAnnouncementMedia(supabase, [row]) : new Map();
      const image = row.media_id ? media.get(row.media_id) : undefined;
      return {
        id: row.id,
        title: row.title,
        tag: row.tag,
        date: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(row.created_at)),
        excerpt: row.body,
        imageUrl: image?.url,
        imageAlt: image?.alt ?? undefined,
        priority: "priority" in row ? row.priority ?? "normal" : "normal",
        pinned: "pinned_until" in row ? Boolean(row.pinned_until && new Date(row.pinned_until).getTime() > Date.now()) : false,
      };
    }
    return null;
  }
  return developmentFallback(seedAnnouncements).find((a) => a.id === id) ?? null;
}

export async function getAnnouncementVersions(id: string): Promise<AnnouncementVersionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("announcement_versions")
    .select("*")
    .eq("announcement_id", id)
    .order("version_number", { ascending: false });
  return error ? [] : data ?? [];
}
