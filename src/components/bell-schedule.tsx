"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bellPeriods, getCurrentBellPeriod } from "@/lib/bell-schedule";

export default function BellSchedule() {
  const [currentPeriod, setCurrentPeriod] = useState<number | null>();

  useEffect(() => {
    const update = () => setCurrentPeriod(getCurrentBellPeriod(new Date())?.period ?? null);
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="bell-schedule" className="scroll-mt-28 overflow-hidden rounded-[18px] border border-line bg-card shadow-sm" aria-labelledby="bell-schedule-title">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">School day</p>
          <h2 id="bell-schedule-title" className="mt-1 text-2xl font-bold text-ink">2026–2027 Bell Schedule</h2>
          <p className="mt-1 text-sm text-muted">Student schedule and bathroom access times.</p>
          <p aria-live="polite" className="mt-2 text-sm font-semibold text-navy">{currentPeriod === undefined ? "Checking the current period…" : currentPeriod ? `Now: Period ${currentPeriod}` : "No period is currently in session"}</p>
        </div>
        <Link href="https://www.baysidehighschool.org/apps/bell_schedules/index.jsp?id=9999" target="_blank" rel="noreferrer" className="shrink-0 text-sm font-bold text-navy">Official schedule ↗</Link>
      </header>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-content-bg text-xs uppercase tracking-[0.12em] text-muted">
            <tr><th className="px-6 py-3">Period</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">End</th><th className="px-4 py-3">Length</th><th className="px-6 py-3">Bathroom access</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bellPeriods.map((item) => {
              const isCurrent = item.period === currentPeriod;
              return <tr key={item.period} aria-current={isCurrent ? "time" : undefined} className={`text-ink transition-colors ${isCurrent ? "bg-orange/25 ring-2 ring-inset ring-orange" : "hover:bg-content-bg/70"}`}><th scope="row" className="px-6 py-3 font-bold">Period {item.period}{isCurrent ? <span className="ml-2 rounded-full bg-orange px-2 py-0.5 text-[10px] font-bold uppercase text-black">Now</span> : null}</th><td className="whitespace-nowrap px-4 py-3">{item.start}</td><td className="whitespace-nowrap px-4 py-3">{item.end}</td><td className="whitespace-nowrap px-4 py-3 text-muted">{item.length} min</td><td className="whitespace-nowrap px-6 py-3 text-muted">{item.bathroom}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-line sm:hidden">
        {bellPeriods.map((item) => {
          const isCurrent = item.period === currentPeriod;
          return <article key={item.period} aria-current={isCurrent ? "time" : undefined} className={`px-5 py-4 ${isCurrent ? "bg-orange/25 ring-2 ring-inset ring-orange" : ""}`}><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-ink">Period {item.period}{isCurrent ? <span className="ml-2 rounded-full bg-orange px-2 py-0.5 text-[10px] font-bold uppercase text-black">Now</span> : null}</h3><p className="font-semibold text-ink">{item.start}–{item.end}</p></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted"><span>{item.length} minutes</span><span>Bathrooms {item.bathroom}</span></div></article>;
        })}
      </div>
    </section>
  );
}
