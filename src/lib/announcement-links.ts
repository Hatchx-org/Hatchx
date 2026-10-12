export type AnnouncementPart = { text: string; href?: string };

/** Link only explicit HTTPS URLs. Text remains plain React text, never HTML. */
export function announcementParts(body: string): AnnouncementPart[] {
  const result: AnnouncementPart[] = [];
  const pattern = /https:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) result.push({ text: body.slice(cursor, start) });
    const raw = match[0];
    const urlText = raw.replace(/[.,!?;:]+$/, "");
    const trailing = raw.slice(urlText.length);
    try {
      const url = new URL(urlText);
      if (url.protocol === "https:" && url.hostname) result.push({ text: urlText, href: url.href });
      else result.push({ text: urlText });
    } catch {
      result.push({ text: urlText });
    }
    if (trailing) result.push({ text: trailing });
    cursor = start + raw.length;
  }
  if (cursor < body.length) result.push({ text: body.slice(cursor) });
  return result;
}
