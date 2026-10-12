const CACHE = "hatchx-assets-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.mode === "navigate") return;

  // HTML and API responses can contain account-specific data. Only cache
  // presentation assets; authenticated pages always remain network-only.
  const cacheable = url.pathname.startsWith("/_next/static/") ||
    ["style", "script", "font", "image"].includes(event.request.destination);
  if (!cacheable || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/api/")) return;

  event.respondWith(fetch(event.request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { title: "Hatchx", body: event.data?.text() ?? "You have a new notification." }; }
  event.waitUntil(self.registration.showNotification(payload.title || "Hatchx", {
    body: payload.body || "You have a new notification.",
    icon: "/brand-logo-light.png",
    badge: "/icon.png",
    tag: payload.id || "hatchx-notification",
    requireInteraction: payload.kind === "emergency_announcement",
    data: { url: payload.href || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  const destination = requested.origin === self.location.origin ? requested.href : new URL("/notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === destination);
    return existing ? existing.focus() : self.clients.openWindow(destination);
  }));
});
