"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3 } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";

type PinterestAccount = { id: string; advertiser_id: string; name: string | null; currency: string; country: string | null };

type PinterestPerformance = {
  currency: string;
  period: { from: string; to: string };
  overview: { spend: number; impressions: number; clicks: number; conversions: number; cpa: number | null; ctr: number | null };
  performances: Array<{ id: string; name: string; impressions: number; clicks: number; spend: number; conversions: number; cpa: number | null }>;
};

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
] as const;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Verdict prudent : on ne déclare jamais une pub "rentable" sans revenu remonté,
// on tranche seulement sur ce qui est certain (dépense sans conversion).
function verdict(campaign: PinterestPerformance["performances"][number]) {
  if (campaign.spend <= 0) return { className: "meta-status", text: "⚪ Pas de dépense" };
  if (campaign.conversions === 0) return { className: "meta-status loss", text: "🛑 Arrête cette pub" };
  return { className: "meta-status watch", text: "⚠️ Surveille cette pub" };
}

export function PinterestAdsPanel({ accounts }: { accounts: PinterestAccount[] }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<PinterestPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accounts.some((account) => account.id === accountId)) setAccountId(accounts[0]?.id ?? "");
  }, [accounts, accountId]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ account_id: accountId, from: isoDaysAgo(days), to: isoDaysAgo(0) });
      const response = await fetch(`/api/pinterest/performance?${query.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setData(null);
        setError(json.error ?? "Impossible de charger les stats Pinterest Ads.");
      } else {
        setData(json as PinterestPerformance);
      }
    } catch {
      setData(null);
      setError("Impossible de contacter Pinterest Ads pour le moment.");
    } finally {
      setLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => { void load(); }, [load]);

  const currency = data?.currency ?? accounts.find((account) => account.id === accountId)?.currency ?? "EUR";

  return (
    <>
      <div className="app-card meta-toolbar">
        {accounts.length > 1 ? (
          <label>{en ? "Ad account" : "Compte publicitaire"}<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.advertiser_id}</option>)}</select></label>
        ) : null}
        <label>{en ? "Period" : "Période"}<select value={days} onChange={(event) => setDays(Number(event.target.value))}>{PERIODS.map((period) => <option key={period.days} value={period.days}>{en ? `${period.days} days` : period.label}</option>)}</select></label>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? (en ? "Refreshing…" : "Actualisation…") : (en ? "Refresh" : "Actualiser")}</button>
      </div>

      {error ? <p className="store-error" role="alert">{error}</p> : null}

      {loading && !data ? <div className="empty-state">{en ? "Loading Pinterest Ads stats…" : "Chargement des stats Pinterest Ads…"}</div> : null}

      {data ? (
        <>
          <div className="vendeo-kpi-grid meta-kpis">
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Spend" : "Dépenses"}</span><strong>{money(data.overview.spend, currency)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Clicks" : "Clics"}</span><strong>{data.overview.clicks.toLocaleString("fr-FR")}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Conversions</span><strong>{data.overview.conversions.toLocaleString("fr-FR")}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Cost per conversion" : "Coût par conversion"}</span><strong>{data.overview.cpa === null ? (en ? "Unavailable" : "Non disponible") : money(data.overview.cpa, currency)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Impressions</span><strong>{data.overview.impressions.toLocaleString("fr-FR")}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Click-through rate" : "Taux de clic"}</span><strong>{data.overview.ctr === null ? (en ? "Unavailable" : "Non disponible") : `${data.overview.ctr.toFixed(2)} %`}</strong></div>
          </div>

          <section className="app-card meta-campaigns">
            <div className="card-head"><div><span className="eyebrow">{en ? "Media analysis" : "Analyse média"}</span><h2>{en ? "Pinterest campaigns" : "Campagnes Pinterest"}</h2></div><Activity size={18} color="#103ef8" /></div>
            {data.performances.length ? (
              <div className="meta-table">
                <div className="meta-table-head"><span>{en ? "Campaign" : "Campagne"}</span><span>{en ? "Spend" : "Dépenses"}</span><span>{en ? "Cost per conversion" : "Coût par conversion"}</span><span>{en ? "Clicks" : "Clics"}</span><span>{en ? "Vendeo verdict" : "Verdict Vendeo"}</span></div>
                {data.performances.map((campaign) => {
                  const v = verdict(campaign);
                  return (
                    <div className="meta-table-row" key={campaign.id}>
                      <strong>{campaign.name}</strong>
                      <span>{money(campaign.spend, currency)}</span>
                      <span>{campaign.cpa === null ? (en ? "Unavailable" : "Non disponible") : money(campaign.cpa, currency)}</span>
                      <span>{campaign.clicks.toLocaleString("fr-FR")}</span>
                      <span className={v.className}>{v.text}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><BarChart3 size={24} /><strong>{en ? "No campaigns for this period" : "Aucune campagne sur la période"}</strong><span>{en ? `No Pinterest Ads spend recorded in the last ${days} days.` : `Aucune dépense Pinterest Ads enregistrée sur les ${days} derniers jours.`}</span></div>
            )}
            <p className="hint-line">{en ? "Pinterest ROAS is not calculated yet: verdicts are based on spend and conversions." : "Le retour publicitaire (ROAS) Pinterest n'est pas encore calculé : les verdicts se basent sur les dépenses et les conversions."}</p>
          </section>
        </>
      ) : null}
    </>
  );
}
