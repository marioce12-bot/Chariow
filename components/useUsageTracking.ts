"use client";

import { useEffect, useRef } from "react";
import { shouldRotateUsageSession, type UsageSessionState } from "@/lib/usage-tracking";

const SESSION_KEY = "vendeo_usage_session_id";
const SESSION_ACTIVITY_KEY = "vendeo_usage_session_activity_at";
const HEARTBEAT_MS = 20_000;
const MAX_SECONDS_PER_FLUSH = 60;
const ROTATE_AFTER_HIDDEN_MS = 30 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

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

/** Clears only usage identity; navigation state in sessionStorage is preserved. */
export function clearUsageSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_ACTIVITY_KEY);
  } catch {
    // Storage can be unavailable in private browsing; tracking is best effort.
  }
}

/** Counts elapsed time only while visible; heartbeat intervals are persisted server-side. */
export function useUsageTracking(section: string) {
  const sectionRef = useRef(section);
  const lastTickRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const newVisitRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);
  const flushRef = useRef<(useBeacon?: boolean) => void>(() => {});

  // Comparing against the ref makes StrictMode's repeated effect setup a no-op.
  useEffect(() => {
    if (sectionRef.current === section) return;
    flushRef.current();
    sectionRef.current = section;
    newVisitRef.current = true;
    lastTickRef.current = document.visibilityState === "visible" ? Date.now() : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    let timer: number | null = null;
    let disposed = false;
    let inFlight = false;
    let failures = 0;

    function clearTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }

    function schedule(delay: number) {
      clearTimer();
      if (disposed || failures >= MAX_CONSECUTIVE_FAILURES || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => { void flush(); }, delay);
    }

    async function flush(useBeacon = false) {
      if (!useBeacon && inFlight) return;
      const last = lastTickRef.current;
      if (last === null) return;
      const now = Date.now();
      const seconds = Math.min(MAX_SECONDS_PER_FLUSH, Math.max(0, Math.floor((now - last) / 1000)));
      lastTickRef.current = document.visibilityState === "visible" ? now : null;
      if (seconds === 0 && !newVisitRef.current) return;
      sessionIdRef.current = getSession(now);
      const payload = JSON.stringify({ session_id: sessionIdRef.current, section: sectionRef.current, seconds, new_visit: newVisitRef.current });
      newVisitRef.current = false;

      if (useBeacon && typeof navigator.sendBeacon === "function") {
        try {
          if (!navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }))) {
            console.warn("Usage tracking: browser rejected beacon");
          }
        } catch {
          // A pagehide beacon is best-effort and cannot return an HTTP result.
        }
        return;
      }

      inFlight = true;
      let succeeded = false;
      try {
        const response = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        failures = 0;
        succeeded = true;
      } catch (error) {
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          console.error("Usage tracking stopped after consecutive heartbeat failures", error);
        } else {
          console.warn("Usage tracking heartbeat failed; backing off", { failures, error });
        }
      } finally {
        inFlight = false;
        if (!disposed && document.visibilityState === "visible") {
          lastTickRef.current = Date.now();
          if (succeeded) schedule(HEARTBEAT_MS);
          else if (failures < MAX_CONSECUTIVE_FAILURES) schedule(HEARTBEAT_MS * (2 ** (failures - 1)));
        }
      }
    }

    flushRef.current = (useBeacon = false) => { void flush(useBeacon); };
    if (document.visibilityState === "visible") {
      lastTickRef.current = Date.now();
      schedule(HEARTBEAT_MS);
    } else {
      hiddenAtRef.current = Date.now();
    }

    function onVisibility() {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = now;
        clearTimer();
        void flush(true);
      } else {
        const hiddenAt = hiddenAtRef.current;
        if (hiddenAt !== null && now - hiddenAt >= ROTATE_AFTER_HIDDEN_MS) {
          sessionIdRef.current = null;
          newVisitRef.current = true;
        }
        hiddenAtRef.current = null;
        lastTickRef.current = now;
        schedule(HEARTBEAT_MS);
      }
    }

    function onPageHide() { void flush(true); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      disposed = true;
      clearTimer();
      flushRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);
}
