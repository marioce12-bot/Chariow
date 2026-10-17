"use client";

import { useEffect, useRef } from "react";
import { shouldRotateUsageSession, type UsageSessionState } from "@/lib/usage-tracking";

const SESSION_KEY = "vendeo_usage_session_id";
const SESSION_ACTIVITY_KEY = "vendeo_usage_session_activity_at";
const HEARTBEAT_MS = 20_000;
const MAX_SECONDS_PER_FLUSH = 60;
const ROTATE_AFTER_HIDDEN_MS = 30 * 60 * 1000;

type PendingSession = { id: string; lastActivityAt: number };

function getSession(now: number): string {
  try {
    const id = window.sessionStorage.getItem(SESSION_KEY);
    const activity = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY));
    const current: UsageSessionState | null = id && Number.isFinite(activity) && activity > 0
      ? { id, lastActivityAt: activity }
      : null;
    const next: PendingSession = shouldRotateUsageSession(current, now)
      ? { id: crypto.randomUUID(), lastActivityAt: now }
      : { ...current!, lastActivityAt: now };
    window.sessionStorage.setItem(SESSION_KEY, next.id);
    window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(next.lastActivityAt));
    return next.id;
  } catch (error) {
    console.error("Usage tracking: session storage unavailable", error);
    return crypto.randomUUID();
  }
}

/** Counts elapsed time only while visible; heartbeat intervals are persisted server-side. */
export function useUsageTracking(section: string) {
  const sectionRef = useRef(section);
  const lastTickRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const newVisitRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);

  function flush(useBeacon = false) {
    const last = lastTickRef.current;
    if (last === null) return;
    const now = Date.now();
    const seconds = Math.min(MAX_SECONDS_PER_FLUSH, Math.max(0, Math.floor((now - last) / 1000)));
    lastTickRef.current = document.visibilityState === "visible" ? now : null;
    if (seconds === 0 && !newVisitRef.current) return;
    sessionIdRef.current = getSession(now);
    const payload = JSON.stringify({ session_id: sessionIdRef.current, section: sectionRef.current, seconds, new_visit: newVisitRef.current });
    newVisitRef.current = false;
    try {
      if (useBeacon && typeof navigator.sendBeacon === "function") {
        if (!navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }))) {
          console.error("Usage tracking: browser rejected beacon; usage interval may be lost");
        }
      } else {
        void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true })
          .then((response) => { if (!response.ok) console.error(`Usage tracking failed (${response.status})`); })
          .catch((error) => console.error("Usage tracking request failed", error));
      }
    } catch (error) {
      console.error("Usage tracking delivery failed", error);
    }
  }

  // Comparing against the ref makes StrictMode's repeated effect setup a no-op.
  useEffect(() => {
    if (sectionRef.current === section) return;
    flush();
    sectionRef.current = section;
    newVisitRef.current = true;
    lastTickRef.current = document.visibilityState === "visible" ? Date.now() : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (document.visibilityState === "visible") lastTickRef.current = Date.now();
    const interval = window.setInterval(() => flush(), HEARTBEAT_MS);
    function onVisibility() {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = now;
        flush(true);
      } else {
        const hiddenAt = hiddenAtRef.current;
        if (hiddenAt !== null && now - hiddenAt >= ROTATE_AFTER_HIDDEN_MS) {
          sessionIdRef.current = null;
          newVisitRef.current = true;
        }
        hiddenAtRef.current = null;
        lastTickRef.current = now;
      }
    }
    function onPageHide() { flush(true); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
