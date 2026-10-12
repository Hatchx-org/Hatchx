export type SearchResult = {
  kind: "Club" | "Announcement" | "Opportunity" | "Event";
  title: string;
  href: string;
  meta?: string;
  keywords?: string;
};

export const MAX_SEARCH_RESULTS = 50;

const synonymGroups = [
  ["club", "clubs", "organization", "organizations", "group"],
  ["volunteer", "volunteering", "service", "community"],
  ["job", "jobs", "internship", "internships", "career", "work"],
  ["college", "university", "precollege", "campus"],
  ["sport", "sports", "athletic", "athletics", "team"],
  ["announcement", "announcements", "news", "update", "updates", "notice"],
  ["event", "events", "calendar", "activity", "activities"],
  ["stem", "science", "technology", "engineering", "math"],
] as const;

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function variants(term: string) {
  const group = synonymGroups.find(values => values.some(value => value === term));
  return group ? [...new Set<string>([term, ...group])] : [term];
}

function distance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function fuzzyMatch(term: string, words: string[]) {
  if (term.length < 4) return false;
  const allowance = term.length >= 7 ? 2 : 1;
  return words.some(word => Math.abs(word.length - term.length) <= allowance && distance(term, word) <= allowance);
}

/** Rank exact, synonym and typo-tolerant matches without allowing unrelated short words. */
export function rankSearchResults(results: SearchResult[], query: string, limit = 24): SearchResult[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean).slice(0, 10);
  if (!terms.length) return [];
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.min(MAX_SEARCH_RESULTS, Math.floor(limit))) : 24;
  const seen = new Set<string>();

  return results.map((result, index) => {
    if (seen.has(result.href)) return null;
    const title = normalize(result.title);
    const meta = normalize(result.meta ?? "");
    const searchable = `${title} ${meta} ${normalize(result.keywords ?? "")}`.trim();
    const words = searchable.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const term of terms) {
      const alternatives = variants(term);
      const direct = alternatives.find(value => value.length <= 3 ? words.includes(value) : searchable.includes(value));
      if (direct) {
        const synonym = direct !== term;
        if (title === direct) score += synonym ? 75 : 140;
        else if (title.startsWith(direct)) score += synonym ? 55 : 95;
        else if (title.includes(direct)) score += synonym ? 35 : 60;
        else if (meta.includes(direct)) score += synonym ? 20 : 30;
        else score += synonym ? 12 : 18;
      } else if (fuzzyMatch(term, words)) score += 10;
      else return null;
    }
    score += Math.max(0, 10 - index / 100);
    seen.add(result.href);
    return { result, score, index };
  }).filter((item): item is { result: SearchResult; score: number; index: number } => item !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, boundedLimit)
    .map(item => item.result);
}
