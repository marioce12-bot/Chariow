const CACHE_NAME = "vendeo-shell-v3";
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/vendeo-logo-light.webp",
  "/vendeo-logo.webp",
  "/icons/icon-192.png",
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
