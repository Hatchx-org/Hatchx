import "server-only";

function safeMessage(error: unknown) {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/(authorization|token|secret|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, (url) => url.split("?")[0])
    .slice(0, 1000);
}

export async function recordServerError(source: string, error: unknown, context: Record<string, unknown> = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Server error reporting is not configured", { source, message: safeMessage(error) });
    return;
  }
  const safeContext = Object.fromEntries(Object.entries(context).filter(([key, value]) => !/token|secret|password|cookie|authorization/i.test(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 20));
  try {
    const response = await fetch(`${url}/rest/v1/system_errors`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ source: source.slice(0, 80), message: safeMessage(error), context: safeContext }),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) console.error("Server error persistence returned", response.status);
  } catch (reportingError) {
    console.error("Could not persist server error", reportingError);
  }
}
