"use client";

import { useEffect, useState } from "react";
import { getSchoolDayStatus, getTimeOfDayGreeting } from "@/lib/bell-schedule";

function getSnapshot() {
  const now = new Date();
  return { greeting: getTimeOfDayGreeting(now), status: getSchoolDayStatus(now) };
}

export default function DashboardNow({ firstName }: { firstName: string }) {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof getSnapshot> | null>(null);

  useEffect(() => {
    const update = () => setSnapshot(getSnapshot());
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return <>
    <div>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">{snapshot?.greeting ?? "Welcome"}, {firstName}.</h1>
      <p className="mt-2 text-sm text-muted">Here is the latest from your Hatchx.</p>
    </div>
    <div aria-live="polite" className="mt-4 max-w-sm rounded-control border border-line bg-content-bg/85 px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-powder">Right now</p>
      <p className="mt-1 font-display text-lg font-bold uppercase text-ink">{snapshot?.status.label ?? "Checking schedule…"}</p>
      {snapshot ? <p className="mt-0.5 text-xs text-muted">{snapshot.status.detail}{snapshot.status.period ? ` · Bathroom ${snapshot.status.period.bathroom}` : ""}</p> : null}
    </div>
  </>;
}
