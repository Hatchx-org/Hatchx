"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

function sessionId() {
  const key = "bayside-analytics-session";
  let value = sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
  return value;
}

export function sendProductEvent(eventName: string, entityId?: string, value?: number) {
  const width = window.innerWidth;
  const payload = JSON.stringify({ eventName, entityId, value, route: window.location.pathname, sessionId: sessionId(), metadata: {
    device: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop",
    connection: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "unknown",
  } });
  navigator.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }));
}

export default function ProductAnalytics() {
  const pathname = usePathname();
  useEffect(() => { sendProductEvent("page_view"); }, [pathname]);
  useReportWebVitals(metric => {
    if (["LCP", "INP", "CLS"].includes(metric.name)) sendProductEvent(metric.name, metric.id, metric.value);
  });
  return null;
}
