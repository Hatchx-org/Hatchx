"use client";

import { useState } from "react";

export default function AnnouncementActions({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url: window.location.href });
      return;
    }
    await copyLink();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const button = "rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-content-bg";
  return (
    <div className="flex flex-wrap gap-2" aria-label="Announcement actions">
      <button type="button" onClick={share} className={button}>Share</button>
      <button type="button" onClick={copyLink} className={button} aria-live="polite">{copied ? "Link copied" : "Copy link"}</button>
      <button type="button" onClick={() => window.print()} className={button}>Print</button>
    </div>
  );
}
