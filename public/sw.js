const CACHE_NAME = "vendeo-shell-v6";
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/vendeo-logo-light.webp",
  "/vendeo-logo.webp",
  "/icons/icon-192.png",
  "/icons/notification-badge-96.png",
  "/offline.html",
];
const DOCUMENT_PATHS = new Set(["/", "/dashboard"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("vendeo-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

async function offlineFallback(cache) {
  return (await cache.match("/offline.html")) || new Response(
    "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Hors connexion</title><body><h1>Connexion internet perdue</h1><p>Reconnecte-toi puis réessaie d’ouvrir ton tableau de bord.</p></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && DOCUMENT_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        const finalPath = new URL(response.url || url.href).pathname;
        if (response.ok && finalPath === "/dashboard") await cache.put("/dashboard", response.clone());
        return response;
      } catch {
        if (url.pathname === "/" && await cache.match("/dashboard")) {
          return Response.redirect(new URL("/dashboard", self.location.origin), 302);
        }
        if (url.pathname === "/dashboard") {
          const dashboard = await cache.match("/dashboard");
          if (dashboard) return dashboard;
        }
        return offlineFallback(cache);
      }
    })());
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});


// A real OS notification is created only for a push received from our server.
function notificationTarget(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/dashboard", self.location.origin);
    return url.origin === self.location.origin && ["http:", "https:"].includes(url.protocol) ? url.href : new URL("/dashboard", self.location.origin).href;
  } catch { return new URL("/dashboard", self.location.origin).href; }
}
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* safe fallback */ }
  if (!payload || typeof payload !== "object") payload = {};
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.slice(0, 160) : "Vendeo";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 2000) : "Vous avez une nouvelle notification.";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag.slice(0, 200) : `vendeo-${Date.now()}`;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/notification-badge-96.png",
    tag,
    silent: false,
    vibrate: [180, 80, 180],
    data: { url: notificationTarget(payload.url) },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try { await client.navigate(target); return await client.focus(); } catch { /* try next window */ }
    }
    return self.clients.openWindow(target);
  })());
});
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const subscription = event.newSubscription || await self.registration.pushManager.subscribe(event.oldSubscription?.options);
      if (!subscription) return;
      await fetch("/api/push/subscription", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
    } catch { /* The next signed-in visit will repair the subscription. */ }
  })());
});
