"use client";

let lastFingerprint = "";
let lastSentAt = 0;

export function reportClientError(error: Error & { digest?: string }, source = "client-boundary") {
  const message = String(error.message || error.name || "Client error")
    .replace(/(authorization|token|secret|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, (url) => url.split("?")[0])
    .slice(0, 800);
  const fingerprint = `${source}:${error.digest ?? ""}:${message}`;
  const now = Date.now();
  if (fingerprint === lastFingerprint && now - lastSentAt < 30_000) return;
  lastFingerprint = fingerprint;
  lastSentAt = now;
  void fetch("/api/errors", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, message, digest: error.digest?.slice(0, 160), route: window.location.pathname.slice(0, 300) }),
  }).catch(() => undefined);
}
