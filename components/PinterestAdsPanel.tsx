"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, Eye, Info, PauseCircle } from "lucide-react";
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

function money(value: number, currency: string, locale: "fr" | "en") {
  try {
    return new Intl.NumberFormat((locale === "en" ? "en-US" : "fr-FR"), { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString((locale === "en" ? "en-US" : "fr-FR"), { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Verdict prudent : on ne déclare jamais une pub "rentable" sans revenu remonté,
// on tranche seulement sur ce qui est certain (dépense sans conversion).
function verdict(campaign: PinterestPerformance["performances"][number]) {
  if (campaign.spend <= 0) return { className: "meta-status", kind: "none" as const };
  if (campaign.conversions === 0) return { className: "meta-status loss", kind: "cut" as const };
  return { className: "meta-status watch", kind: "watch" as const };
}

export function PinterestAdsPanel({ accounts }: { accounts: PinterestAccount[] }) {
  const { locale, t } = useI18n();
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
        setError(json.error ?? t("interfaceExtra.statsUnavailable", { platform: "Pinterest" }));
      } else {
        setData(json as PinterestPerformance);
      }
    } catch {
      setData(null);
      setError(t("interfaceExtra.platformUnavailable", { platform: "Pinterest" }));
    } finally {
      setLoading(false);
    }
  }, [accountId, days, t]);

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

      {error ? <p className="store-error" role="alert">{localizeSystemMessage(error, locale)}</p> : null}

      {loading && !data ? <div className="empty-state">{en ? "Loading Pinterest Ads stats…" : "Chargement des stats Pinterest Ads…"}</div> : null}

      {data ? (
        <>
          <div className="vendeo-kpi-grid meta-kpis">
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Spend" : "Dépenses"}</span><strong>{money(data.overview.spend, currency, locale)}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Clicks" : "Clics"}</span><strong>{data.overview.clicks.toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Conversions</span><strong>{data.overview.conversions.toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">Impressions</span><strong>{data.overview.impressions.toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">{en ? "Click-through rate" : "Taux de clic"}</span><strong>{data.overview.ctr === null ? "-" : `${data.overview.ctr.toFixed(2)} %`}</strong></div>
          </div>

          <section className="app-card meta-campaigns">
            <div className="card-head"><div><span className="eyebrow">{en ? "Media analysis" : "Analyse média"}</span><h2>{en ? "Pinterest campaigns" : "Campagnes Pinterest"}</h2></div><Activity size={18} color="#103ef8" /></div>
            {data.performances.length ? (
              <div className="meta-table">
                <div className="meta-table-head"><span>{en ? "Campaign" : "Campagne"}</span><span>{en ? "Spend" : "Dépenses"}</span><span>{en ? "Conversions" : "Conversions"}</span><span>{en ? "Clicks" : "Clics"}</span><span>{en ? "Vendeo verdict" : "Verdict Vendeo"}</span></div>
                {data.performances.map((campaign) => {
                  const v = verdict(campaign);
                  return (
                    <div className="meta-table-row" key={campaign.id}>
                      <strong>{campaign.name}</strong>
                      <span>{money(campaign.spend, currency, locale)}</span>
                      <span>{campaign.conversions.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</span>
                      <span>{campaign.clicks.toLocaleString((locale === "en" ? "en-US" : "fr-FR"))}</span>
                      <span className={v.className}>{v.kind === "cut" ? <PauseCircle size={14} /> : v.kind === "watch" ? <Eye size={14} /> : <Activity size={14} />}{v.kind === "cut" ? (en ? "Cut" : "À couper") : v.kind === "watch" ? (en ? "Watch" : "À surveiller") : (en ? "No spend" : "Aucune dépense")}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><BarChart3 size={24} /><strong>{en ? "No campaigns for this period" : "Aucune campagne sur la période"}</strong><span>{en ? `No Pinterest Ads spend recorded in the last ${days} days.` : `Aucune dépense Pinterest Ads enregistrée sur les ${days} derniers jours.`}</span></div>
            )}
            <div className="hint-line"><span className="meta-status">{en ? "Coming soon" : "Bientôt"}</span> <span title={en ? "Profitability will be shown when linked sales are available." : "La rentabilité apparaîtra lorsque les ventes liées seront disponibles."} aria-label={en ? "Profitability will be shown when linked sales are available." : "La rentabilité apparaîtra lorsque les ventes liées seront disponibles."}><Info size={14} /></span></div>
          </section>
        </>
      ) : null}
    </>
  );
}
