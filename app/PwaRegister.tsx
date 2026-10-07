"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CACHE_NAME = "vendeo-shell-v3";

async function cacheDashboardShell() {
  if (!navigator.onLine || !("caches" in window)) return;

  try {
    const response = await fetch("/dashboard", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    const finalUrl = new URL(response.url, window.location.origin);
    if (!response.ok || finalUrl.pathname !== "/dashboard" || !response.headers.get("content-type")?.includes("text/html")) return;

    const cache = await caches.open(CACHE_NAME);
    await cache.put("/dashboard", response.clone());

    // Le document seul ne suffit pas hors ligne : garder aussi les bundles et
    // feuilles de style Next déjà chargés par l’espace authentifié.
    const staticAssets = performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name, window.location.origin))
      .filter((url) => url.origin === window.location.origin && url.pathname.startsWith("/_next/static/"));

    await Promise.allSettled(staticAssets.map(async (url) => {
      const assetResponse = await fetch(url.href, { cache: "force-cache", credentials: "same-origin" });
      if (assetResponse.ok) await cache.put(url.href, assetResponse);
    }));
  } catch {
    // L’application reste utilisable en ligne même si le préchauffage échoue.
  }
}

export function PwaRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (!cancelled && pathname === "/dashboard") void cacheDashboardShell();
      })
      .catch(() => undefined);

    const handleOnline = () => {
      if (pathname === "/dashboard") void cacheDashboardShell();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [pathname]);

  return null;
}
