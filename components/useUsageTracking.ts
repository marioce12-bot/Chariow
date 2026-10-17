"use client";

import { useEffect, useRef } from "react";

const SESSION_KEY = "vendeo_usage_session_id";
const HEARTBEAT_MS = 20_000;
const MAX_SECONDS_PER_FLUSH = 60;

function getSessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Mesure le temps passé par section dans le Dashboard.
 * Le temps ne compte que quand l'onglet est visible ; il est envoyé toutes les 20 s,
 * à chaque changement de section et à la fermeture de l'onglet.
 */
export function useUsageTracking(section: string) {
  const sectionRef = useRef(section);
  const lastTickRef = useRef<number | null>(null);
  const newVisitRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);

  function flush(useBeacon = false) {
    const last = lastTickRef.current;
    if (last === null) return;
    const now = Date.now();
    const seconds = Math.min(MAX_SECONDS_PER_FLUSH, Math.max(0, Math.round((now - last) / 1000)));
    lastTickRef.current = document.visibilityState === "visible" ? now : null;
    if (!sessionIdRef.current) sessionIdRef.current = getSessionId();
    const payload = JSON.stringify({ session_id: sessionIdRef.current, section: sectionRef.current, seconds, new_visit: newVisitRef.current });
    newVisitRef.current = false;
    try {
      if (useBeacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => undefined);
      }
    } catch {
      // Le suivi ne doit jamais perturber l'app.
    }
  }

  // Changement de section : on envoie le temps de la section quittée, puis on repart à zéro.
  useEffect(() => {
    flush();
    sectionRef.current = section;
    newVisitRef.current = true;
    lastTickRef.current = document.visibilityState === "visible" ? Date.now() : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    const interval = window.setInterval(() => flush(), HEARTBEAT_MS);
    function onVisibility() {
      if (document.visibilityState === "hidden") flush(true);
      else lastTickRef.current = Date.now();
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
