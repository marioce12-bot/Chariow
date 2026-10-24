"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PerformanceData } from "./PerformanceVisuelView";
import type { CampaignRecord } from "./campaign-recommendations";
import { buildCampaignRecommendations, campaignRecommendationFingerprint, selectStrongestCampaignRecommendation } from "./campaign-recommendations";

type RecommendationSection = "visual" | "campaign";
type SignalState = { identity: string | null; visual: string | null; campaign: string | null };
type SeenState = SignalState & { ready: boolean };
const STORAGE_PREFIX = "vendeo:algorithm-recommendation-seen:v1";

function storageKey(userId: string, storeId: string, section: RecommendationSection) {
  return `${STORAGE_PREFIX}:${userId}:${storeId}:${section}`;
}
function safeRead(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Storage can be unavailable or full. */ }
}

export function usePerformanceRecommendationBadges({
  userId,
  storeId,
  activeSection,
}: {
  userId: string | null;
  storeId: string | null;
  activeSection: string;
}) {
  const identity = userId && storeId ? `${userId}:${storeId}` : null;
  const [signals, setSignals] = useState<SignalState>({ identity: null, visual: null, campaign: null });
  const [seen, setSeen] = useState<SeenState>({ identity: null, visual: null, campaign: null, ready: false });
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);

  useEffect(() => {
    setSignals({ identity, visual: null, campaign: null });
    setSeen({ identity, visual: null, campaign: null, ready: false });
    if (!identity || !userId || !storeId) {
      setSeen({ identity, visual: null, campaign: null, ready: true });
      return;
    }

    const requestedStoreId = storeId;
    const visualSeen = safeRead(storageKey(userId, requestedStoreId, "visual"));
    const campaignSeen = safeRead(storageKey(userId, requestedStoreId, "campaign"));
    setSeen({ identity, visual: visualSeen, campaign: campaignSeen, ready: true });

    let alive = true;
    let inFlight = false;
    let lastRefreshAt = 0;
    const controller = new AbortController();
    async function refresh() {
      const requestedAt = Date.now();
      if (inFlight || requestedAt - lastRefreshAt < 60_000) return;
      inFlight = true;
      lastRefreshAt = requestedAt;
      try {
        const performanceQuery = new URLSearchParams({ store_id: requestedStoreId, days: "30", read_only: "1" });
        const campaignQuery = new URLSearchParams({ store_id: requestedStoreId });
        const [performanceResponse, campaignsResponse] = await Promise.all([
          fetch(`/api/creative-performance?${performanceQuery.toString()}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/ad-campaigns?${campaignQuery.toString()}`, { cache: "no-store", signal: controller.signal }),
        ]);
        if (!performanceResponse.ok || !campaignsResponse.ok) return;
        const [performance, campaignBody] = await Promise.all([
          performanceResponse.json() as Promise<PerformanceData>,
          campaignsResponse.json() as Promise<{ campaigns?: CampaignRecord[] }>,
        ]);
        if (!alive) return;
        const visual = performance.visualRecommendations?.[0]?.signature ?? null;
        const records = Array.isArray(campaignBody.campaigns) ? campaignBody.campaigns : [];
        const recommendations = buildCampaignRecommendations(performance, records);
        const strongest = selectStrongestCampaignRecommendation(recommendations.values());
        const campaign = strongest ? campaignRecommendationFingerprint(strongest, performance.period) : null;
        setSignals((current) => {
          if (current.identity !== identity) return current;
          const active = activeSectionRef.current;
          return {
            identity,
            visual: active === "Performance visuel" ? current.visual : visual,
            campaign: active === "Performance publicitaire" ? current.campaign : campaign,
          };
        });
      } catch {
        // A failed refresh must not clear an already-known, unseen recommendation.
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      controller.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [identity, storeId, userId]);

  const reportRecommendation = useCallback((section: RecommendationSection, sourceStoreId: string, signature: string | null) => {
    if (!identity || !userId || !storeId || sourceStoreId !== storeId) return;
    const field = section === "visual" ? "visual" : "campaign";
    setSignals((current) => current.identity === identity ? { ...current, [field]: signature } : current);
    const isCurrentlyConsulted = section === "visual"
      ? activeSectionRef.current === "Performance visuel"
      : activeSectionRef.current === "Performance publicitaire";
    if (signature && isCurrentlyConsulted) {
      safeWrite(storageKey(userId, storeId, section), signature);
      setSeen((current) => current.identity === identity ? { ...current, [field]: signature, ready: true } : current);
    }
  }, [identity, storeId, userId]);

  const stateReady = Boolean(identity && seen.identity === identity && seen.ready && signals.identity === identity);
  return {
    hasNewVisualRecommendation: stateReady && activeSection !== "Performance visuel" && Boolean(signals.visual) && signals.visual !== seen.visual,
    hasNewCampaignRecommendation: stateReady && activeSection !== "Performance publicitaire" && Boolean(signals.campaign) && signals.campaign !== seen.campaign,
    reportRecommendation,
  };
}
