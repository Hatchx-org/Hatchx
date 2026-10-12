export function developmentFallback<T>(fallback: T[], environment = process.env.NODE_ENV): T[] {
  return environment === "production" ? [] : fallback;
}

export function normalizeRecordId(id: string | number): string {
  return String(id);
}
