"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

export const NAVIGATION_FRESH_MS = 60_000;
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
  async load(url: string, version = 0, force = false) {
    return this.loadComputed(url, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Data request failed");
      return response.json();
    }, version, force);
  }
  async loadComputed<T>(url: string, loader: () => Promise<T>, version = 0, force = false) {
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { snapshot: EMPTY, updated: 0, version, generation: 0 };
      this.entries.set(url, entry);
    }
    if (entry.pending) return entry.pending;
    if (!force && entry.updated && entry.version === version && Date.now() - entry.updated < NAVIGATION_FRESH_MS) return;
    const current = entry;
    const generation = current.generation;
    current.version = version;
    current.snapshot = { ...current.snapshot, loading: current.snapshot.data === undefined, refreshing: true, error: false };
    current.pending = (async () => {
      try {
        const data = await loader();
        if (this.entries.get(url) !== current || current.generation !== generation) return;
        // An imperative reader may abandon its render while its request is still running.
        // An absent result is not a successful empty API response (which is normally null/[]).
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
  /** Mutations keep usable data, expire every affected reading and discard obsolete in-flight results. */
  invalidate = () => {
    this.entries.forEach((entry) => {
      entry.updated = 0;
      entry.generation++;
      entry.pending = undefined;
      entry.snapshot = { ...entry.snapshot, refreshing: false };
    });
    this.emit();
  };
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
export function useNavigationData<T>(url: string | null, options: { version?: number } = {}) {
  const cache = useNavigationCache();
  const version = options.version ?? 0;
  const snapshot = useSyncExternalStore(cache.subscribe, () => cache.snapshot(url), () => EMPTY) as Snapshot<T>;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (url) void cache.load(url, version);
    return () => { mounted.current = false; };
  }, [cache, url, version]);
  // Invalidations trigger this effect for mounted readers; freshness/pending deduplicate reads.
  useEffect(() => { if (url && mounted.current) void cache.load(url, version); }, [cache, url, version, snapshot]);
  useEffect(() => {
    if (!url) return;
    const refreshStale = () => { if (document.visibilityState !== "hidden") void cache.load(url, version); };
    const timer = window.setInterval(refreshStale, NAVIGATION_FRESH_MS);
    window.addEventListener("focus", refreshStale);
    window.addEventListener("online", refreshStale);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshStale); window.removeEventListener("online", refreshStale); };
  }, [cache, url, version]);
  return { ...snapshot, refresh: () => { if (url) void cache.load(url, version, true); } };
}
