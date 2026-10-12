import type { Metadata } from "next";
import { getEvents } from "@/lib/events";

export const metadata: Metadata = { title: "Spirit Week" };

const days = [
  { day: "Monday", name: "Pajama Day", color: "bg-navy text-cream" },
  { day: "Tuesday", name: "Twin Day", color: "bg-peach text-black" },
  { day: "Wednesday", name: "Dress Like a Teacher Day", color: "bg-orange text-black" },
  { day: "Thursday", name: "Class Color Day", color: "bg-cream text-navy" },
  { day: "Friday", name: "Blue & Gold Day", color: "bg-navy text-cream" },
];

export default async function SpiritWeekPage() {
  const events = await getEvents();
  const spirit = events.find((e) => e.category === "spirit-week");
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="page-title-card mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange">SPIRIT WEEK</p>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          Spirit Week is a time to show off our SCHOOL SPIRIT!
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-muted">
          Each day of the week is filled with something different. View all
          five fun days of spirit week and join in!
        </p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {days.map((d, i) => (
          <li
            key={d.day}
            className={`flex flex-col items-center rounded-card p-6 text-center shadow-sm ${d.color}`}
          >
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">
              {d.day}
            </span>
            <span className="mt-1 text-3xl font-black text-black">{i + 1}</span>
            <span className="mt-2 font-bold">{d.name}</span>
          </li>
        ))}
      </ol>

      {spirit && (
        <div className="mt-8 rounded-card border border-line bg-card p-6 shadow-sm">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-ink">Date:</dt>
              <dd className="text-muted">{spirit.date}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-ink">Time:</dt>
              <dd className="text-muted">{spirit.time}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-ink">Location:</dt>
              <dd className="text-muted">{spirit.location}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-ink">Price:</dt>
              <dd className="text-muted">{spirit.price}</dd>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <dt className="w-24 shrink-0 font-semibold text-ink">Description:</dt>
              <dd className="leading-6 text-muted">{spirit.description}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
