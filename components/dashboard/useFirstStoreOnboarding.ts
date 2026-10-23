"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreData } from "./shared";

export type OnboardingStage = "closed" | "welcome" | "tour";
type Phase = "pending" | "welcome" | "tour" | "done";
type Props = { userId: string | null; stores: StoreData[]; loading: boolean; connected: boolean };

async function persist(phase: Phase): Promise<Phase | undefined> {
  const response = await fetch("/api/onboarding", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase }),
  });
  if (!response.ok) throw new Error("Impossible de sauvegarder le guide");
  const data = await response.json() as { phase?: Phase };
  return data.phase;
}

export function useFirstStoreOnboarding({ userId, stores, loading, connected }: Props) {
  const [phase, setPhase] = useState<Phase | undefined>();
  const [stage, setStage] = useState<OnboardingStage>("closed");
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const user = useRef(userId);
  user.current = userId;
  const replaying = useRef(false);
  // Serialize welcome -> tour -> done even if the user advances immediately.
  // This only records UI progress; subscription dates/rights are never written.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback((next: Phase) => {
    const owner = user.current;
    const task = queue.current.catch(() => {}).then(() => {
      if (owner !== user.current) return undefined;
      return persist(next);
    });
    queue.current = task;
    return task;
  }, []);

  useEffect(() => {
    let alive = true;
    replaying.current = false;
    setLoadedUser(null); setPhase(undefined); setStage("closed");
    if (!userId) return;
    fetch("/api/onboarding", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("onboarding fetch failed");
      const data = await response.json() as { phase?: Phase };
      if (!alive) return;
      setPhase(data.phase);
      if (data.phase === "welcome") setStage("welcome");
      if (data.phase === "tour") setStage("tour");
      setLoadedUser(userId);
    }).catch(() => { if (alive) setLoadedUser(userId); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedUser !== userId || loading || replaying.current || phase !== "pending" || !connected || !stores.some(store => store.connection_status === "connected")) return;
    setPhase("welcome"); setStage("welcome");
    void save("welcome").catch(() => {});
  }, [userId, loadedUser, loading, connected, stores, phase, save]);

  const beginConnection = useCallback(async () => {
    if (phase && phase !== "pending") return;
    try {
      // Server authenticates the request even if the display name/user ID is still loading.
      const saved = await save("pending");
      if (saved) setPhase(saved);
    } catch { /* Keep the existing Chariow connection working if progress storage is unavailable. */ }
  }, [phase, save]);
  const startTour = useCallback(() => {
    setStage("tour");
    if (!replaying.current) { setPhase("tour"); void save("tour").catch(() => {}); }
  }, [save]);
  const dismiss = useCallback(() => {
    setStage("closed");
    if (!replaying.current) { setPhase("done"); void save("done").catch(() => {}); }
  }, [save]);
  const replay = useCallback(() => { replaying.current = true; setStage("tour"); }, []);
  return { stage, beginConnection, startTour, dismiss, replay };
}
