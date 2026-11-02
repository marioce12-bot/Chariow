"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DASHBOARD_ANALYTICS_FALLBACK_MS } from "@/lib/dashboard-analytics-periods";

export const NAVIGATION_FRESH_MS = 12 * 60_000;
type RefreshEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;
type VisibilityEventTarget = Pick<Document, "visibilityState" | "hasFocus" | "addEventListener" | "removeEventListener">;
const isForeground = (target: VisibilityEventTarget) => target.visibilityState === "visible" && target.hasFocus();
function analyticsUrl(url: string) {
  try { const parsed = new URL(url, "https://navigation.invalid"); return parsed.pathname === "/api/analytics" ? parsed : null; }
  catch { return null; }
}

/** intervalMs=0 listens for return/online events only; analytics never has a timer. */
export function scheduleNavigationRefresh(
  refresh: () => void,
  intervalMs: number,
  documentTarget: VisibilityEventTarget,
  windowTarget: RefreshEventTarget,
  refreshOnVisibilityReturn = false,
) {
  const refreshWhenVisible = () => { if (isForeground(documentTarget)) refresh(); };
  const timer = intervalMs > 0 ? setInterval(refreshWhenVisible, intervalMs) : null;
  windowTarget.addEventListener("focus", refreshWhenVisible);
  windowTarget.addEventListener("online", refreshWhenVisible);
  if (refreshOnVisibilityReturn) documentTarget.addEventListener("visibilitychange", refreshWhenVisible);
  return () => {
    if (timer !== null) clearInterval(timer);
    windowTarget.removeEventListener("focus", refreshWhenVisible);
    windowTarget.removeEventListener("online", refreshWhenVisible);
    if (refreshOnVisibilityReturn) documentTarget.removeEventListener("visibilitychange", refreshWhenVisible);
  };
}
export function scheduleNavigationRefreshFromCompletion(
  refresh: () => Promise<unknown> | void,
  delayUntilRefresh: () => number,
  documentTarget: VisibilityEventTarget,
  windowTarget: RefreshEventTarget,
  initialRefresh?: Promise<unknown> | void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let stopped = false;
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (stopped || !isForeground(documentTarget)) return;
    timer = setTimeout(() => { timer = null; void run(); }, Math.max(0, delayUntilRefresh()));
  };
  const run = async () => {
    if (stopped || inFlight || !isForeground(documentTarget)) return;
    if (delayUntilRefresh() > 0) { schedule(); return; }
    inFlight = true;
    try { await refresh(); }
    finally { inFlight = false; schedule(); }
  };
  const onReturn = () => { if (isForeground(documentTarget)) void run(); else clearTimer(); };
  documentTarget.addEventListener("visibilitychange", onReturn);
  windowTarget.addEventListener("focus", onReturn);
  windowTarget.addEventListener("online", onReturn);
  windowTarget.addEventListener("blur", clearTimer);
  if (initialRefresh !== undefined) void Promise.resolve(initialRefresh).then(schedule, schedule);
  else schedule();
  return () => {
    stopped = true;
    clearTimer();
    documentTarget.removeEventListener("visibilitychange", onReturn);
    windowTarget.removeEventListener("focus", onReturn);
    windowTarget.removeEventListener("online", onReturn);
    windowTarget.removeEventListener("blur", clearTimer);
  };
}
type Snapshot<T = unknown> = { data: T | undefined; loading: boolean; refreshing: boolean; error: boolean };
type Entry = { snapshot: Snapshot; updated: number; version: number; generation: number; pending?: Promise<void> };
const EMPTY: Snapshot = { data: undefined, loading: true, refreshing: false, error: false };

/** Private to one mounted workspace. Never persisted in local/session storage. */
export class NavigationCache {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach((listener) => listener()); }
  snapshot = (url: string | null): Snapshot => url ? this.entries.get(url)?.snapshot ?? EMPTY : EMPTY;
  millisecondsUntilRefresh(url: string, intervalMs: number) {
    const updated = this.entries.get(url)?.updated ?? 0;
    return updated ? Math.max(0, updated + intervalMs - Date.now()) : intervalMs;
  }
  async load(url: string, version = 0, force = false, freshMs = NAVIGATION_FRESH_MS) {
    return this.loadComputed(url, async () => {
      const isAnalytics = Boolean(analyticsUrl(url));
      const response = await fetch(url, isAnalytics || force ? {
        cache: "no-store",
        ...(isAnalytics && force ? { headers: { "x-vendeo-refresh": "1" } } : {}),
      } : undefined);
      if (!response.ok) throw new Error("Data request failed");
      return response.json();
    }, version, force, freshMs);
  }
  async loadComputed<T>(url: string, loader: () => Promise<T>, version = 0, force = false, freshMs = NAVIGATION_FRESH_MS) {
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { snapshot: EMPTY, updated: 0, version, generation: 0 };
      this.entries.set(url, entry);
    }
    if (entry.pending) return entry.pending;
    if (!force && entry.updated && entry.version === version && Date.now() - entry.updated < freshMs) return;
    const current = entry;
    const generation = current.generation;
    current.version = version;
    current.snapshot = { ...current.snapshot, loading: current.snapshot.data === undefined, refreshing: true, error: false };
    current.pending = (async () => {
      try {
        const data = await loader();
        if (this.entries.get(url) !== current || current.generation !== generation) return;
        // An absent result is not a successful empty API response (normally null/[]).
        if (data === undefined) {
          current.snapshot = { ...current.snapshot, loading: current.snapshot.data === undefined, refreshing: false };
          current.updated = 0;
          return;
        }
        current.snapshot = { data, loading: false, refreshing: false, error: false };
        current.updated = Date.now();
      } catch {
        if (this.entries.get(url) !== current || current.generation !== generation) return;
        current.snapshot = { ...current.snapshot, loading: false, refreshing: false, error: true };
        current.updated = Date.now();
      } finally {
        if (this.entries.get(url) === current && current.generation === generation) {
          current.pending = undefined;
          this.emit();
        }
      }
    })();
    this.emit();
    return current.pending;
  }
  /** Expire only affected readings and discard obsolete in-flight results. */
  invalidateMatching = (matches: (key: string) => boolean) => {
    let changed = false;
    this.entries.forEach((entry, key) => {
      if (!matches(key)) return;
      changed = true;
      entry.updated = 0;
      entry.generation++;
      entry.pending = undefined;
      entry.snapshot = { ...entry.snapshot, refreshing: false };
    });
    if (changed) this.emit();
  };
  invalidateAnalyticsStore = (storeId: string) => this.invalidateMatching((key) => analyticsUrl(key)?.searchParams.get("store_id") === storeId);
  /** Mutations keep usable data, expire every affected reading and discard obsolete in-flight results. */
  invalidate = () => this.invalidateMatching(() => true);
  clear = () => { this.entries.clear(); this.emit(); };
}

const CacheContext = createContext<NavigationCache | null>(null);
export function NavigationDataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new NavigationCache());
  return <CacheContext.Provider value={cache}>{children}</CacheContext.Provider>;
}
export function useNavigationCache() {
  const shared = useContext(CacheContext);
  const [fallback] = useState(() => new NavigationCache());
  return shared ?? fallback;
}
export function useNavigationData<T>(url: string | null, options: { version?: number; freshMs?: number; refreshIntervalMs?: number; visibleOnly?: boolean; refreshOnVisibilityReturn?: boolean; completionAnchoredRefresh?: boolean } = {}) {
  const cache = useNavigationCache();
  const version = options.version ?? 0;
  const isAnalytics = Boolean(url && analyticsUrl(url));
  // A sale invalidates this cache. Otherwise only a stale foreground return may refresh analytics.
  const freshMs = isAnalytics ? DASHBOARD_ANALYTICS_FALLBACK_MS : options.freshMs ?? NAVIGATION_FRESH_MS;
  const refreshIntervalMs = isAnalytics ? 0 : options.refreshIntervalMs ?? NAVIGATION_FRESH_MS;
  const visibleOnly = isAnalytics || (options.visibleOnly ?? false);
  const refreshOnVisibilityReturn = isAnalytics || (options.refreshOnVisibilityReturn ?? false);
  const completionAnchoredRefresh = !isAnalytics && (options.completionAnchoredRefresh ?? false);
  const snapshot = useSyncExternalStore(cache.subscribe, () => cache.snapshot(url), () => EMPTY) as Snapshot<T>;
  const mounted = useRef(false);
  const canRead = () => !visibleOnly || isForeground(document);
  useEffect(() => {
    mounted.current = true;
    if (url && canRead()) void cache.load(url, version, false, freshMs);
    return () => { mounted.current = false; };
  }, [cache, freshMs, url, version, visibleOnly]);
  // Invalidations trigger this effect for mounted readers; freshness/pending deduplicate reads.
  useEffect(() => { if (url && mounted.current && canRead()) void cache.load(url, version, false, freshMs); }, [cache, freshMs, url, version, snapshot, visibleOnly]);
  useEffect(() => {
    if (!url) return;
    if (completionAnchoredRefresh) {
      const refresh = () => {
        if (visibleOnly && !isForeground(document)) return;
        return cache.load(url, version, false, freshMs);
      };
      const initialRefresh = refresh();
      return scheduleNavigationRefreshFromCompletion(refresh, () => cache.millisecondsUntilRefresh(url, Math.max(refreshIntervalMs, freshMs)), document, window, initialRefresh);
    }
    return scheduleNavigationRefresh(() => { void cache.load(url, version, false, freshMs); }, refreshIntervalMs, document, window, refreshOnVisibilityReturn);
  }, [cache, completionAnchoredRefresh, freshMs, refreshIntervalMs, refreshOnVisibilityReturn, url, version, visibleOnly]);
  return { ...snapshot, refresh: () => { if (url) void cache.load(url, version, true, freshMs); } };
}
