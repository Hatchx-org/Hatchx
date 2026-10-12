"use client";

import Link from "next/link";
import { useState } from "react";
import type { DashboardCardId, StudentDashboard } from "@/lib/student-dashboard-data";

const labels: Record<DashboardCardId, string> = {
  meeting: "Next Club meeting",
  attendance: "Recent check-ins",
  registrations: "Registered events",
  deadlines: "Upcoming deadlines",
  notifications: "Unread notifications",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

export default function DashboardPersonalCards({ dashboard }: { dashboard: StudentDashboard }) {
  const [order, setOrder] = useState<DashboardCardId[]>(dashboard.preferences.cardOrder);
  const [hidden, setHidden] = useState<DashboardCardId[]>(dashboard.preferences.hiddenCards);
  const [customizing, setCustomizing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function move(id: DashboardCardId, direction: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaveState("idle");
  }

  function toggle(id: DashboardCardId) {
    setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setSaveState("idle");
  }

  async function save() {
    setSaveState("saving");
    const response = await fetch("/api/dashboard/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardOrder: order, hiddenCards: hidden }),
    });
    setSaveState(response.ok ? "saved" : "error");
  }

  const cards: Record<DashboardCardId, React.ReactNode> = {
    meeting: <InfoCard title={labels.meeting} href={dashboard.nextMeeting ? `/clubs/${dashboard.nextMeeting.clubSlug}` : "/profile#clubs"} action="Club details">
      {dashboard.nextMeeting ? <><strong className="block text-lg text-ink">{dashboard.nextMeeting.clubName}</strong><p className="mt-1 text-sm text-muted">{dateTime(dashboard.nextMeeting.startsAt)}{dashboard.nextMeeting.location ? ` · ${dashboard.nextMeeting.location}` : ""}</p></> : <p className="text-sm text-muted">No upcoming Club meeting found.</p>}
    </InfoCard>,
    attendance: <InfoCard title={labels.attendance} href="/profile#attendance" action="History">
      {dashboard.recentAttendance.length ? <ul className="space-y-2">{dashboard.recentAttendance.map((item) => <li key={item.id} className="text-sm"><Link href={`/clubs/${item.clubSlug}`} className="font-semibold text-ink">{item.sessionLabel}</Link><span className="block text-xs text-muted">{item.clubName} · {dateTime(item.checkedInAt)}</span></li>)}</ul> : <p className="text-sm text-muted">No recent check-ins.</p>}
    </InfoCard>,
    registrations: <InfoCard title={labels.registrations} href="/calendar/registration" action="Registrations">
      {dashboard.registeredEvents.length ? <ul className="space-y-2">{dashboard.registeredEvents.map((item) => <li key={`${item.source}-${item.id}`} className="text-sm"><Link href={item.source === "rsvp" ? `/calendar/${item.id}` : "/calendar/registration"} className="font-semibold text-ink">{item.title}</Link><span className="block text-xs text-muted">{dateTime(item.startAt)}{item.location ? ` · ${item.location}` : ""}</span></li>)}</ul> : <p className="text-sm text-muted">No upcoming registrations.</p>}
    </InfoCard>,
    deadlines: <InfoCard title={labels.deadlines} href="/opportunities" action="Explore">
      {dashboard.upcomingDeadlines.length ? <ul className="space-y-2">{dashboard.upcomingDeadlines.map((item) => <li key={item.id} className="text-sm"><Link href={`/opportunities/${item.id}`} className="font-semibold text-ink">{item.title}</Link><span className="block text-xs text-muted">Due {dateOnly(item.deadline)}</span></li>)}</ul> : <p className="text-sm text-muted">No deadlines in the next 45 days.</p>}
    </InfoCard>,
    notifications: <InfoCard title={labels.notifications} href="/notifications" action="Open inbox"><strong className="block text-3xl text-ink">{dashboard.unreadNotifications}</strong><p className="mt-1 text-sm text-muted">{dashboard.unreadNotifications === 1 ? "notification needs" : "notifications need"} your attention.</p></InfoCard>,
  };

  return <section className="mt-7" aria-labelledby="at-a-glance-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Personalized</p><h2 id="at-a-glance-title" className="mt-1 font-display text-2xl font-bold uppercase text-ink">At a glance</h2></div><button type="button" onClick={() => setCustomizing((value) => !value)} className="rounded-full border border-line bg-card px-4 py-2 text-xs font-bold text-ink">{customizing ? "Done" : "Customize"}</button></div>
    {customizing ? <div className="mt-4 rounded-card border border-line bg-card p-4"><p className="text-sm text-muted">Reorder or hide cards, then save your layout for every device.</p><div className="mt-3 space-y-2">{order.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-control bg-content-bg px-3 py-2 text-sm"><span className="min-w-0 flex-1 font-semibold text-ink">{labels[id]}</span><button type="button" disabled={index === 0} onClick={() => move(id, -1)} className="px-2 disabled:opacity-30" aria-label={`Move ${labels[id]} up`}>↑</button><button type="button" disabled={index === order.length - 1} onClick={() => move(id, 1)} className="px-2 disabled:opacity-30" aria-label={`Move ${labels[id]} down`}>↓</button><button type="button" onClick={() => toggle(id)} className="min-w-14 text-xs font-bold text-navy">{hidden.includes(id) ? "Show" : "Hide"}</button></div>)}</div><div className="mt-4 flex items-center gap-3"><button type="button" onClick={save} disabled={saveState === "saving"} className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-cream">{saveState === "saving" ? "Saving…" : "Save layout"}</button><span role="status" className="text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Could not save" : ""}</span></div></div> : null}
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{order.filter((id) => !hidden.includes(id)).map((id) => <div key={id}>{cards[id]}</div>)}</div>
    {!order.some((id) => !hidden.includes(id)) ? <p className="mt-4 rounded-card border border-dashed border-line bg-card p-6 text-center text-sm text-muted">All cards are hidden. Choose Customize to bring one back.</p> : null}
  </section>;
}

function InfoCard({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
  return <article className="h-full rounded-card border border-line bg-card p-5 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><h3 className="font-display text-lg font-bold uppercase text-ink">{title}</h3><Link href={href} className="shrink-0 text-[11px] font-bold text-powder">{action} →</Link></div>{children}</article>;
}
