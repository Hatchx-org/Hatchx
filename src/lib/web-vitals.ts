export type VitalRow = { event_name: string; route: string | null; metric_value: number | null };
export const vitalTargets = { LCP: 2500, INP: 200, CLS: 0.1 } as const;

export function p75(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * .75) - 1];
}

export function pageVitals(rows: VitalRow[], minimumSamples = 5) {
  const groups = new Map<string, { LCP: number[]; INP: number[]; CLS: number[] }>();
  for (const row of rows) {
    if (!row.route || row.metric_value == null || !Number.isFinite(row.metric_value) || !(row.event_name in vitalTargets)) continue;
    const route = row.route.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id");
    const group = groups.get(route) ?? { LCP: [], INP: [], CLS: [] };
    group[row.event_name as keyof typeof vitalTargets].push(row.metric_value);
    groups.set(route, group);
  }
  return [...groups].map(([route, metrics]) => ({ route, samples: metrics.LCP.length + metrics.INP.length + metrics.CLS.length, LCP: p75(metrics.LCP), INP: p75(metrics.INP), CLS: p75(metrics.CLS) }))
    .filter((row) => row.samples >= minimumSamples)
    .sort((a, b) => (b.LCP ?? 0) - (a.LCP ?? 0));
}
