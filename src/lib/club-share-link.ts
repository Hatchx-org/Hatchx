export const MIN_CLUB_SHARE_LINK_LIFETIME_MS = 5 * 60_000;
export const MAX_CLUB_SHARE_LINK_LIFETIME_MS = 366 * 24 * 60 * 60_000;

export function parseClubShareLinkInput(labelValue: string, expiresValue: string, now = Date.now()) {
  const label = labelValue.trim();
  const expires = new Date(expiresValue);
  const expiresAt = expires.getTime();
  if (label.length < 3 || label.length > 120 || Number.isNaN(expiresAt)) return null;
  if (expiresAt < now + MIN_CLUB_SHARE_LINK_LIFETIME_MS || expiresAt > now + MAX_CLUB_SHARE_LINK_LIFETIME_MS) return null;
  return { label, expiresAt: expires.toISOString() };
}
