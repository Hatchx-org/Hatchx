/** Validate browser-initiated state changes against cross-site request abuse. */
export function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  // Modern browsers send at least Origin or Sec-Fetch-Site on these requests.
  return fetchSite === "same-origin";
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}
