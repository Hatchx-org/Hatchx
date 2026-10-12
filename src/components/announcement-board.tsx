"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Announcement } from "@/lib/data";

type View = "all" | "unread" | "saved";
const readKey = "bayside-announcements-read";
const savedKey = "bayside-announcements-saved";

function loadIds(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set<string>(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export default function AnnouncementBoard({ announcements }: { announcements: Announcement[] }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("unread");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setRead(loadIds(readKey));
      setSaved(loadIds(savedKey));
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function update(setter: (value: Set<string>) => void, key: string, current: Set<string>, id: string, enabled: boolean) {
    const next = new Set(current);
    if (enabled) next.add(id); else next.delete(id);
    setter(next);
    localStorage.setItem(key, JSON.stringify([...next]));
  }

  function markAllRead() {
    const next = new Set(read);
    for (const item of announcements) next.add(item.id);
    setRead(next);
    localStorage.setItem(readKey, JSON.stringify([...next]));
  }

  const visible = useMemo(() => announcements.filter((item) => view === "all" || (view === "unread" ? item.priority === "emergency" || !read.has(item.id) : saved.has(item.id))), [announcements, read, saved, view]);
  const unreadCount = ready ? announcements.filter((item) => item.priority === "emergency" || !read.has(item.id)).length : 0;
  const savedCount = ready ? announcements.filter((item) => saved.has(item.id)).length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex gap-2" role="group" aria-label="Announcement view">
          {(["all", "unread", "saved"] as View[]).map((item) => {
            const count = item === "all" ? announcements.length : item === "unread" ? unreadCount : savedCount;
            return <button key={item} type="button" onClick={() => setView(item)} aria-pressed={view === item} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${view === item ? "bg-navy text-cream" : "border border-line bg-card text-muted hover:text-ink"}`}>{item} <span className="ml-1 opacity-70">{count}</span></button>;
          })}
        </div>
        {unreadCount > 0 ? <button type="button" onClick={markAllRead} className="text-sm font-semibold text-navy hover:underline">Mark all as read</button> : <span className="text-sm text-muted">All caught up</span>}
      </div>

      {visible.length ? <ol className="mt-3 space-y-2">{visible.map((item) => {
        const isRead = ready && read.has(item.id);
        const isSaved = ready && saved.has(item.id);
        const emergency = item.priority === "emergency";
        return <li key={item.id}>
          <article className={`relative overflow-hidden rounded-[16px] border transition-colors ${emergency ? "border-red-500 bg-red-50 ring-2 ring-red-500/20" : `bg-card ${isRead ? "border-line" : "border-powder/70"}`}`}>
            {!isRead ? <span className={`absolute left-0 top-0 h-full w-1 ${emergency ? "bg-red-600" : "bg-navy"}`} aria-label="Unread" /> : null}
            <div className="flex min-h-36">
              <div className="min-w-0 flex-1 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs">{emergency ? <span className="rounded-full bg-red-600 px-2.5 py-1 font-black uppercase tracking-wider text-white">Emergency alert</span> : <span className="rounded-full bg-content-bg px-2.5 py-1 font-semibold text-ink">{item.tag}</span>}{item.priority && item.priority !== "normal" && !emergency ? <span className={`rounded-full px-2.5 py-1 font-bold uppercase ${item.priority === "urgent" ? "bg-orange text-white" : "bg-powder/40 text-ink"}`}>{item.priority}</span> : null}{item.pinned ? <span className={emergency ? "font-bold text-red-800" : "font-bold text-navy"}>Pinned</span> : null}<time className={emergency ? "text-red-800" : "text-muted"}>{item.date}</time>{!isRead ? <span className={emergency ? "font-bold text-red-800" : "font-bold text-navy"}>New</span> : null}</div>
                <Link href={`/announcements/${item.id}`} onClick={() => update(setRead, readKey, read, item.id, true)} className="mt-3 block"><h3 className={`text-xl leading-snug ${emergency ? "text-red-950 hover:text-red-700" : "text-ink hover:text-navy"} ${isRead ? "font-semibold" : "font-bold"}`}>{item.title}</h3><p className={`mt-2 line-clamp-2 text-sm leading-6 ${emergency ? "text-red-900" : "text-muted"}`}>{item.excerpt}</p></Link>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <Link href={`/announcements/${item.id}`} onClick={() => update(setRead, readKey, read, item.id, true)} className="text-navy">Read announcement →</Link>
                  <button type="button" onClick={() => update(setRead, readKey, read, item.id, !isRead)} className="text-muted hover:text-ink">Mark {isRead ? "unread" : "read"}</button>
                  <button type="button" onClick={() => update(setSaved, savedKey, saved, item.id, !isSaved)} className={isSaved ? "text-navy" : "text-muted hover:text-ink"}>{isSaved ? "★ Saved" : "☆ Save"}</button>
                </div>
              </div>
              {item.imageUrl ? <div className="relative hidden w-44 shrink-0 sm:block"><Image src={item.imageUrl} alt={item.imageAlt ?? ""} fill sizes="176px" className="object-cover" /></div> : null}
            </div>
          </article>
        </li>;
      })}</ol> : <div className="mt-4 rounded-card border border-dashed border-line bg-card px-6 py-12 text-center"><p className="font-semibold text-ink">Nothing here right now</p><p className="mt-2 text-sm text-muted">Choose another view or check back for updates.</p></div>}
    </div>
  );
}
