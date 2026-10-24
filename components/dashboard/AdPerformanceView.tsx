"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { EditableCampaign } from "../vendeo/wizard/types";
import type { ProductData } from "./shared";
import { CampaignPerformanceTab } from "./CampaignPerformanceTab";
import type { PerformanceData } from "./PerformanceVisuelView";
import "./performance-visuel.css";

const PERIOD_DAYS = "30";

export function AdPerformanceView({
  storeId,
  products,
  onApplyCampaign,
  readOnly = false,
  locale = "fr",
}: {
  storeId: string | null;
  products: ProductData[];
  onApplyCampaign: (campaign: EditableCampaign) => void;
  readOnly?: boolean;
  locale?: string;
}) {
  const en = locale === "en";
  const previewExamples = readOnly || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "preview";
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
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
    fetch(`/api/creative-performance?store_id=${encodeURIComponent(storeId)}&days=${PERIOD_DAYS}`, { cache: "no-store" })
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
  }, [storeId, en]);

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

      <div className="ad-analysis-note" role="note">
        <span className="ad-analysis-icon"><Sparkles size={18} aria-hidden="true" /></span>
        <p><strong>{en ? "Background analysis" : "Analyse en arrière-plan"}</strong>{en
          ? " — historical campaigns · linked creatives · advertising reports · attributed Chariow sales when available"
          : " — campagnes historiques · créations associées · rapports publicitaires · ventes attribuées Chariow lorsqu’elles sont disponibles"}</p>
      </div>

      {!storeId ? previewExamples ? <CampaignPerformanceTab storeId={null} periodDays={PERIOD_DAYS} data={null} loading={false} products={products} readOnly={readOnly} onApplyCampaign={onApplyCampaign} locale={locale} /> : <div className="creative-state">{en ? "Connect a store to prepare a campaign." : "Connecte une boutique pour préparer une campagne."}</div>
        : loading ? <div className="creative-state" role="status">{en ? "Preparing a recommendation…" : "Préparation de la proposition…"}</div>
          : error ? <div className="creative-error" role="alert">{error}</div>
            : data ? <CampaignPerformanceTab
              storeId={storeId}
              periodDays={PERIOD_DAYS}
              data={data}
              loading={loading}
              products={products}
              readOnly={readOnly}
              onApplyCampaign={onApplyCampaign}
              locale={locale}
            />
              : <div className="creative-state">{en ? "No recommendation is available yet." : "Aucune proposition n’est disponible pour le moment."}</div>}
    </div>
  );
}
