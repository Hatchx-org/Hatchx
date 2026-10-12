"use client";

import { useState } from "react";

export default function ShareSearchButton() {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-bold text-ink">{copied ? "Link copied" : "Copy search link"}</button>;
}
