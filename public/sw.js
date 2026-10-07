const CACHE_NAME = "vendeo-shell-v2";
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/vendeo-logo-light.webp",
  "/vendeo-logo.webp",
  "/icons/icon-192.png",
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
        if (response.ok && finalPath === "/dashboard") {
          await cache.put("/dashboard", response.clone());
        }
        return response;
      } catch {
        // À la racine, ne jamais retomber sur la landing publique hors ligne :
        // rediriger vers le shell dashboard déjà chargé par cette session.
        if (url.pathname === "/" && await cache.match("/dashboard")) {
          return Response.redirect(new URL("/dashboard", self.location.origin), 302);
        }
        const exact = await cache.match(url.pathname);
        if (exact) return exact;
        return Response.error();
      }
    })());
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
