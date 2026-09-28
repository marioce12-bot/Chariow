"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

type TikTokPerformance = {
  currency: string;
  chariowCurrency: string;
  period: { from: string; to: string };
  overview: { spend: number; impressions: number; clicks: number; ctr: number | null; conversions: number; cpa: number | null; chariowRevenue: number; sales: number; cac: number | null };
  performances: Array<{ id: string; name: string; spend: number; impressions: number; clicks: number; conversions: number; cpa: number | null; ctr: number | null }>;
};

export default function TikTokStats({ accountId }: { accountId: string }) {
  const [data, setData] = useState<TikTokPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tiktok/performance?account_id=${encodeURIComponent(accountId)}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Impossible de charger les statistiques TikTok Ads");
      setData(json as TikTokPerformance);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les statistiques TikTok Ads");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);

  const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(2)} %`);
  const money = (value: number | null, currency: string) => (value === null ? "Non disponible" : formatMoney(value, currency));

  return (
    <>
      <div className="app-card meta-toolbar" style={{ marginBottom: 18 }}>
        <span className="metric-label">{data ? `Du ${data.period.from} au ${data.period.to}` : "30 derniers jours"}</span>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? "Chargement…" : "Actualiser"}</button>
      </div>

      {error ? <p className="store-error" role="alert">{error}</p> : null}

      {data ? (
        <>
          <div className="vendeo-kpi-grid meta-kpis">
            <div className="vendeo-kpi"><span className="metric-label">Dépenses publicitaires</span><strong>{formatMoney(data.overview.spend, data.currency)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Chiffre d'affaires réel Chariow</span><strong>{formatMoney(data.overview.chariowRevenue, data.chariowCurrency)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Coût moyen pour obtenir une vente</span><strong>{money(data.overview.cac, data.currency)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Clics</span><strong>{data.overview.clicks.toLocaleString("fr-FR")}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Taux de clic (CTR)</span><strong>{percent(data.overview.ctr)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Coût par conversion (TikTok)</span><strong>{money(data.overview.cpa, data.currency)}</strong></div>
          </div>

          {data.overview.conversions === 0 ? (
            <div className="meta-conversion-info" role="status">TikTok ne rapporte aucune conversion : aucun Pixel TikTok n'est configuré sur le parcours de vente, ou aucune vente n'a encore été attribuée.</div>
          ) : null}

          {data.performances.length ? (
            <section className="app-card" style={{ marginTop: 18 }}>
              <div className="card-head"><div><span className="eyebrow">Par campagne</span><h2>Campagnes TikTok</h2></div></div>
              <div style={{ display: "grid", gap: 12 }}>
                {data.performances.map((campaign) => (
                  <div key={campaign.id} style={{ display: "grid", gap: 4, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <strong>{campaign.name}</strong>
                    <small>Dépensé : {formatMoney(campaign.spend, data.currency)} · Clics : {campaign.clicks.toLocaleString("fr-FR")} · CTR : {percent(campaign.ctr)}</small>
                    <small>Conversions : {campaign.conversions} · Coût par conversion : {money(campaign.cpa, data.currency)}</small>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="empty-state">Aucune campagne TikTok avec des dépenses sur cette période.</div>
          )}
        </>
      ) : loading ? (
        <div className="empty-state">Chargement des statistiques TikTok Ads…</div>
      ) : null}
    </>
  );
}
