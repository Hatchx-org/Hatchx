"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, MegaphoneIcon, ClubsIcon, CalendarIcon, OpportunitiesIcon } from "./icons";
import type { SearchResult as Result } from "@/lib/search";
import { sendProductEvent } from "./product-analytics";

const kindIcon: Record<Result["kind"], (props: React.SVGProps<SVGSVGElement>) => React.ReactNode> = {
  Club: ClubsIcon,
  Announcement: MegaphoneIcon,
  Opportunity: OpportunitiesIcon,
  Event: CalendarIcon,
};

const groupOrder: Result["kind"][] = ["Announcement", "Club", "Opportunity", "Event"];

function highlight(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-peach/60 px-0.5 text-black">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return { grouped: [] as { kind: Result["kind"]; items: Result[] }[], flat: [] as Result[] };
    const grouped = groupOrder
      .map((kind) => ({
        kind,
        items: results.filter((r) => r.kind === kind),
      }))
      .filter((g) => g.items.length > 0);
    const flat: Result[] = grouped.flatMap((g) => g.items);
    return { grouped, flat };
  }, [query, results]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Search request failed");
        const payload = (await response.json()) as { results?: Result[] };
        setResults(payload.results ?? []);
        setActive(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const visibleCount = matches.grouped.reduce((n, g) => n + g.items.length, 0);
  const safeActive = Math.min(active, Math.max(visibleCount - 1, 0));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  function openResult(href: string) {
    if (href.startsWith("/clubs/")) sendProductEvent("search_result_click", href.split("/").filter(Boolean).at(-1));
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function openSearchPage() {
    const q = query.trim();
    if (q.length < 2) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-md min-w-0 flex-1 sm:flex-none">
      <label className="relative block">
        <span className="sr-only">Search clubs, events, announcements, and opportunities</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
        <input
          id="site-search"
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search clubs, events, announcements..."
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-activedescendant={visibleCount ? `search-result-${safeActive}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              setResults([]);
              setLoading(false);
              setActive(0);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (visibleCount ? (a + 1) % visibleCount : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (visibleCount ? (a - 1 + visibleCount) % visibleCount : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const item = matches.flat[safeActive];
              if (item) openResult(item.href); else openSearchPage();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-9 w-full rounded-full border border-line bg-card pl-9 pr-4 text-sm text-ink outline-none transition-shadow placeholder:text-muted focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
      </label>

      {open && (
        <div
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="search-popover absolute left-0 right-0 top-11 z-[80] max-h-[min(26rem,calc(100vh-8rem))] overscroll-contain overflow-y-auto rounded-card border border-line p-1.5"
        >
          {query.trim() === "" ? (
            <div className="px-3 py-2.5">
              <p className="text-sm font-medium text-ink">Jump to</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { href: "/clubs", label: "Clubs" },
                  { href: "/clubs/apply", label: "Apply for a Club" },
                  { href: "/sports", label: "Sports" },
                  { href: "/events", label: "Events" },
                  { href: "/announcements", label: "Updates & Calendar" },
                  { href: "/opportunities", label: "Opportunities" },
                  { href: "/support", label: "Support" },
                ].map((p) => (
                  <button
                    key={p.href}
                    type="button"
                    onClick={() => openResult(p.href)}
                    className="rounded-full bg-content-bg px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-navy hover:text-cream"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : query.trim().length < 2 ? (
            <p className="px-3 py-3 text-sm text-muted">
              Type at least two characters to search.
            </p>
          ) : loading ? (
            <p className="px-3 py-3 text-sm text-muted" role="status">
              Searching…
            </p>
          ) : visibleCount === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              No results for “{query}”. Try clubs, announcements, or events.
            </p>
          ) : (
            matches.grouped.map((group) => (
              <div key={group.kind}>
                <p className="px-3 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                  {group.kind}s
                </p>
                {group.items.map((item) => {
                  const Icon = kindIcon[item.kind];
                  const flatIndex = matches.flat.indexOf(item);
                  return (
                    <button
                      key={item.href}
                      type="button"
                      id={`search-result-${flatIndex}`}
                      role="option"
                      aria-selected={flatIndex === safeActive}
                      onMouseEnter={() => setActive(flatIndex)}
                      onClick={() => openResult(item.href)}
                      className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors ${
                        flatIndex === safeActive ? "bg-navy text-cream" : "text-ink hover:bg-content-bg"
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          flatIndex === safeActive ? "text-peach" : "text-muted"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {highlight(item.title, query.trim())}
                        </span>
                        {item.meta && (
                          <span
                            className={`block truncate text-xs ${
                              flatIndex === safeActive ? "text-cream/80" : "text-muted"
                            }`}
                          >
                            {highlight(item.meta, query.trim())}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
          {visibleCount > 0 && (
            <div className="mt-1 flex items-center gap-3 border-t border-line px-3 py-1.5 text-[11px] text-muted">
              <span>
                <kbd className="rounded-md border border-line bg-content-bg px-1.5 py-0.5 font-mono">↑↓</kbd>{" "}
                navigate
              </span>
              <span>
                <kbd className="rounded-md border border-line bg-content-bg px-1.5 py-0.5 font-mono">↵</kbd>{" "}
                open
              </span>
              <span className="ml-auto">
                <kbd className="rounded-md border border-line bg-content-bg px-1.5 py-0.5 font-mono">esc</kbd>{" "}
                close
              </span>
            </div>
          )}
          {query.trim().length >= 2 && <button type="button" onClick={openSearchPage} className="mt-1 w-full border-t border-line px-3 py-2 text-left text-xs font-bold text-navy">View all results for “{query.trim()}” →</button>}
        </div>
      )}
    </div>
  );
}
