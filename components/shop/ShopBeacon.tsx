"use client";

import { useEffect } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT, hasMarketingConsent } from "@/lib/legal/cookie-consent";

const COOKIE = "vendeo_visitor_id";

function visitorId(): string {
  const existing = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  return id;
}

// Compte une visite par session de navigation (avec les UTM de l'annonce, pour mesurer les pubs qui mènent à la vitrine).
export function ShopBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const trackVisit = () => {
      if (!hasMarketingConsent()) return;
      try {
        const key = `vendeo_shop_visit_${slug}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        const params = new URLSearchParams(window.location.search);
        const body: Record<string, string> = { type: "visit", slug, visitor_id: visitorId() };
        for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
          const value = params.get(param);
          if (value) body[param] = value.slice(0, 255);
        }
        void fetch("/api/shop/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
      } catch {
        /* la mesure facultative ne doit jamais interrompre l’affichage de la vitrine */
      }
    };
    trackVisit();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, trackVisit);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, trackVisit);
  }, [slug]);
  return null;
}
