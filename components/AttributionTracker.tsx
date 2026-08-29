"use client";

import { useEffect } from "react";
import { getAttributionFromSearch } from "@/lib/attribution";

const VISITOR_COOKIE = "vendeo_visitor_id";
const ATTRIBUTION_STORAGE = "vendeo_attribution";

function visitorId() {
  const existing = document.cookie.split("; ").find((part) => part.startsWith(`${VISITOR_COOKIE}=`))?.split("=")[1];
  if (existing) return existing;
  const id = crypto.randomUUID();
  document.cookie = `${VISITOR_COOKIE}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`;
  return id;
}

export function AttributionTracker() {
  useEffect(() => {
    const touch = getAttributionFromSearch(new URLSearchParams(window.location.search), visitorId());
    if (!touch) return;
    const existing = window.localStorage.getItem(ATTRIBUTION_STORAGE);
    if (!existing || touch.utmCampaign || touch.fbclid) window.localStorage.setItem(ATTRIBUTION_STORAGE, JSON.stringify(touch));
    void fetch("/api/attribution/touch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(touch), keepalive: true });
  }, []);
  return null;
}
