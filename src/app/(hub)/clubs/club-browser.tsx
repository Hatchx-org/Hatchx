"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClubCard } from "@/components/cards";
import { PageHeader } from "@/components/ui";
import type { Club } from "@/lib/data";

const meetingDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function ClubBrowser({ clubs, joinedClubSlugs, signedIn }: { clubs: Club[]; joinedClubSlugs: string[]; signedIn: boolean }) {
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [tag, setTag] = useState<string>("All");
  const [day, setDay] = useState<string>("Any");
  const [commitment, setCommitment] = useState(0);
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const joined = useMemo(() => new Set(joinedClubSlugs), [joinedClubSlugs]);
  const tags = useMemo(() => [...new Set(clubs.flatMap((club) => club.tags?.length ? club.tags : [club.category]))].sort((a, b) => a.localeCompare(b)), [clubs]);

  const filtered = useMemo(() => {
    return clubs.filter((club) => {
      if (scope === "mine" && !joined.has(club.slug)) return false;
      if (tag !== "All" && !(club.tags ?? [club.category]).includes(tag)) return false;
      if (day !== "Any" && !club.meetingDays.includes(day)) return false;
      if (commitment > 0 && club.commitment > commitment) return false;
      if (
        query &&
        !`${club.name} ${club.category} ${(club.tags ?? []).join(" ")} ${club.description} ${club.fullDescription ?? ""} ${club.activities ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        return false;
      return true;
    });
  }, [clubs, tag, day, commitment, query, scope, joined]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Club[]>();
    for (const c of filtered) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const clear = () => {
    setTag("All");
    setDay("Any");
    setCommitment(0);
    setQuery("");
  };

  const hasFilters = tag !== "All" || day !== "Any" || commitment > 0 || query !== "";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Clubs &amp; Teams"
        subtitle={`Explore ${clubs.length} school Clubs, athletic teams, and student groups.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="View mode"
              className="flex overflow-hidden rounded-full border border-line"
            >
              <button
                type="button"
                onClick={() => setGrouped(false)}
                aria-pressed={!grouped}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  !grouped ? "bg-navy text-cream" : "text-cream/80 hover:bg-cream/10"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setGrouped(true)}
                aria-pressed={grouped}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  grouped ? "bg-navy text-cream" : "text-cream/80 hover:bg-cream/10"
                }`}
              >
                By Category
              </button>
            </div>
            <Link
              href="/clubs/quiz"
              className="inline-flex h-10 items-center justify-center rounded-[22px] border border-cream px-6 font-display text-xs font-extrabold tracking-wide text-cream transition-colors hover:bg-cream/10"
            >
              Take Club 101 Quiz
            </Link>
            <Link
              href="/clubs/apply"
              className="inline-flex h-10 items-center justify-center rounded-[22px] bg-cream px-6 font-display text-xs font-extrabold tracking-wide text-black transition-colors hover:bg-white"
            >
              Apply for a New Club
            </Link>
          </div>
        }
      />

      <nav aria-label="Club directory scope" className="mb-6 flex w-fit rounded-full border border-line bg-card p-1">
        <button type="button" onClick={() => setScope("all")} aria-pressed={scope === "all"} className={`rounded-full px-5 py-2 text-sm font-bold ${scope === "all" ? "bg-navy text-cream" : "text-muted hover:text-ink"}`}>All Clubs &amp; Teams</button>
        <button type="button" onClick={() => setScope("mine")} aria-pressed={scope === "mine"} className={`rounded-full px-5 py-2 text-sm font-bold ${scope === "mine" ? "bg-navy text-cream" : "text-muted hover:text-ink"}`}>My Clubs</button>
      </nav>

      <div className="mb-4 sm:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="club-filters"
          className="flex h-11 w-full items-center justify-between rounded-control border border-line bg-card px-4 text-sm font-semibold text-ink"
        >
          <span>Filters{hasFilters ? " · Active" : ""}</span>
          <span aria-hidden>{filtersOpen ? "−" : "+"}</span>
        </button>
      </div>

      <div
        id="club-filters"
        className={`${filtersOpen ? "block" : "hidden"} mb-6 rounded-card border border-line bg-card p-5 shadow-sm sm:block`}
      >
        <div className="mb-4">
          <label htmlFor="club-search" className="mb-1.5 block text-sm font-semibold text-ink">
            Search this list
          </label>
          <input
            id="club-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try robotics, service, or art"
            className="h-10 w-full rounded-control border border-line bg-content-bg px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-powder focus:ring-2 focus:ring-powder/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-ink">Interest tag:</span>
          {["All", ...tags].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTag(c)}
              aria-pressed={tag === c}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tag === c
                  ? "bg-navy text-cream"
                  : "bg-content-bg text-ink hover:bg-cream/10"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Meeting day:</span>
            {["Any", ...meetingDays].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                aria-pressed={day === d}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  day === d
                    ? "bg-orange text-black"
                    : "bg-content-bg text-ink hover:bg-cream/10"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink">Commitment:</span>
            <input
              type="range"
              min={0}
              max={5}
              value={commitment}
              onChange={(e) => setCommitment(Number(e.target.value))}
              aria-label="Maximum weekly commitment hours"
              className="h-2 w-40 cursor-pointer appearance-none rounded-full bg-content-bg accent-powder"
            />
            <span className="w-8 text-sm font-semibold text-powder">
              {commitment > 0 ? `≤${commitment} hours` : "Any"}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted" role="status">
          {filtered.length} club{filtered.length === 1 ? "" : "s"} found
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="text-sm font-semibold text-powder hover:text-cream"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card/60 px-6 py-14 text-center">
          <p className="text-base font-semibold text-ink">{scope === "mine" ? "No joined Clubs yet" : "No Clubs or teams match your filters"}</p>
          <p className="mt-1 text-sm text-muted">{scope === "mine" ? signedIn ? "Join a Club or team and it will appear here." : "Sign in to see the Clubs and teams you joined." : "Try removing a filter to see more results."}</p>
          {scope === "mine" ? signedIn ? <button type="button" onClick={() => setScope("all")} className="mt-4 rounded-full bg-navy px-5 py-2 text-sm font-bold text-cream">Explore all Clubs</button> : <Link href="/login?next=/clubs" className="mt-4 inline-flex rounded-full bg-navy px-5 py-2 text-sm font-bold text-cream">Sign in</Link> : null}
        </div>
      ) : grouped ? (
        <div className="space-y-10">
          {byCategory.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-4 font-display text-xl font-bold uppercase tracking-wide text-ink">
                {cat}
                <span className="ml-2 text-sm font-semibold normal-case tracking-normal text-muted">
                  {list.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((club) => (
                  <ClubCard key={club.slug} club={club} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((club) => (
            <ClubCard key={club.slug} club={club} />
          ))}
        </div>
      )}
    </div>
  );
}
