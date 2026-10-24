"use client";

import { useEffect, useState } from "react";
import type { EditableCampaign } from "../vendeo/wizard/types";
import type { ProductData } from "./shared";
import { CampaignPerformanceTab } from "./CampaignPerformanceTab";
import type { PerformanceData } from "./PerformanceVisuelView";
import { PerformanceEmptyState, PerformanceLoadingSkeleton } from "./PerformanceLoadingStates";
import "./performance-visuel.css";

const PERIOD_DAYS = "30";

export function AdPerformanceView({
  storeId,
  products,
  onApplyCampaign,
  onRecommendationChange,
  readOnly = false,
  locale = "fr",
}: {
  storeId: string | null;
  products: ProductData[];
  onApplyCampaign: (campaign: EditableCampaign) => void;
  onRecommendationChange?: (storeId: string, signature: string | null) => void;
  readOnly?: boolean;
  locale?: string;
}) {
  const en = locale === "en";
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(Boolean(storeId));
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!storeId) {
      setData(null);
      setError("");
      setLoading(false);
      return () => { alive = false; };
    }

    setData(null);
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ store_id: storeId, days: PERIOD_DAYS });
    if (readOnly) query.set("read_only", "1");
    fetch(`/api/creative-performance?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (en ? "Campaign suggestions are temporarily unavailable." : "Les propositions de campagne sont momentanément indisponibles."));
        return body as PerformanceData;
      })
      .then((result) => { if (alive) setData(result); })
      .catch((loadError) => {
        if (alive) setError(loadError instanceof Error ? loadError.message : (en ? "Campaign suggestions are temporarily unavailable." : "Les propositions de campagne sont momentanément indisponibles."));
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [storeId, en, readOnly]);

  return (
    <div className="creative-performance ad-performance-view">
      <header className="creative-performance-header">
        <div>
          <div className="creative-performance-breadcrumb">{en ? "Ads" : "Pub"} <span aria-hidden="true">›</span> {en ? "Ad performance" : "Performance publicitaire"}</div>
          <h1>{en ? "Ad performance" : "Performance publicitaire"}</h1>
          <p>{en
            ? "A clear strategy, proposed from the data available to you."
            : "Une stratégie claire, proposée à partir des données disponibles."}</p>
        </div>
      </header>

      {!storeId ? <div className="creative-state">{en ? "Connect a store to prepare a campaign." : "Connecte une boutique pour préparer une campagne."}</div>
        : loading ? <PerformanceLoadingSkeleton variant="campaigns" locale={locale} />
          : error ? <div className="creative-error" role="alert">{error}</div>
            : data ? <CampaignPerformanceTab
              storeId={storeId}
              periodDays={PERIOD_DAYS}
              data={data}
              loading={loading}
              products={products}
              readOnly={readOnly}
              onApplyCampaign={onApplyCampaign}
              onRecommendationChange={onRecommendationChange}
              locale={locale}
            />
              : <PerformanceEmptyState variant="campaigns" locale={locale} />}
    </div>
  );
}
