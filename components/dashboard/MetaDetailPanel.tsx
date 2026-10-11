"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoneyInUSD } from "@/lib/format";
import { toUsd } from "@/lib/currency";
import { useI18n } from "@/lib/i18n/i18n";
import { MetaHistoryOverview } from "./MetaHistoryOverview";
import { OverviewDetails } from "./OverviewDetails";
import { MetricHelp } from "./shared";
import type { AnalyticsData } from "./shared";

/**
 * Détail Meta (historique des campagnes, dépenses vs revenu net, meilleurs produits,
 * entonnoir, verdicts par campagne). Auparavant affiché sur la Vue d'ensemble, il vit
 * maintenant dans la section Meta de l'onglet Pub. Le composant est autonome : il charge
 * lui-même ses données à partir de l'identifiant de la boutique.
 */

type MetaAccountState = {
  id: string;
  currency: string;
  last_backfill_at: string | null;
  backfill_status: "processing" | "in_progress" | "failed" | "complete" | null;
  backfill_next_from?: string | null;
};

type MetaCampaignPerformance = {
  id: string;
  name: string;
  spend: number | null;
  realRoas: number | null;
  realSales: number | null;
  attributionReliable: boolean;
  decision: "pause" | "keep_running" | "learning" | "insufficient_data";
  suggestedIncrease: number | null;
};

type MetaPerformanceLite = { currency: string; performances: MetaCampaignPerformance[] };

export function MetaDetailPanel({ storeId, onLaunchAd }: { storeId: string | null; onLaunchAd: () => void }) {
  const { t, locale } = useI18n();
  const en = locale === "en";
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<AnalyticsData>(null);
  const [metaDaily, setMetaDaily] = useState<Array<{ date: string; spend: number | null }>>([]);
  const [campaignDaily, setCampaignDaily] = useState<Array<{ date: string; spend: number | null; netRevenue: number | null; campaigns: number }>>([]);
  const [metaAccount, setMetaAccount] = useState<MetaAccountState | null>(null);
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformanceLite | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const periodRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - periodDays + 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, [periodDays]);

  const overview = data?.overview ?? null;
  const products = data?.products ?? [];
  const currency = products[0]?.currency ?? "XOF";
  const overviewCurrency = overview?.currency ?? currency;

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void fetch(`/api/analytics?store_id=${encodeURIComponent(storeId)}&from=${periodRange.from}&to=${periodRange.to}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => { if (!cancelled && result?.snapshot) setData(result.snapshot as AnalyticsData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [periodRange, storeId]);

  useEffect(() => {
    if (!storeId) { setCampaignDaily([]); return; }
    let cancelled = false;
    void fetch(`/api/overview/campaign-history?store_id=${encodeURIComponent(storeId)}&from=${periodRange.from}&to=${periodRange.to}&currency=${encodeURIComponent(overviewCurrency)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (!cancelled) setCampaignDaily(result?.daily ?? []); })
      .catch(() => { if (!cancelled) setCampaignDaily([]); });
    return () => { cancelled = true; };
  }, [overviewCurrency, periodRange, storeId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const accountsResponse = await fetch("/api/integrations/meta/accounts");
      const accountsData = accountsResponse.ok ? await accountsResponse.json() : { accounts: [] };
      const accounts = (accountsData.accounts ?? []) as Array<MetaAccountState & { is_selected?: boolean | null }>;
      const chosen = accounts.find((account) => account.is_selected) ?? accounts[0] ?? null;
      setMetaAccount(chosen);
      if (chosen) {
        const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(chosen.id)}&store_id=${encodeURIComponent(storeId ?? "")}&from=${periodRange.from}&to=${periodRange.to}`);
        setMetaPerformance(metrics.ok ? ((await metrics.json()) as MetaPerformanceLite) : null);
      } else {
        setMetaPerformance(null);
      }
    } catch {
      setMetaPerformance(null);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { void refresh(); }, [periodRange, storeId]);

  const performances = metaPerformance?.performances ?? [];
  const adsCurrency = metaPerformance?.currency ?? currency;

  const productPerformance = data?.productPerformance
    ?? products.map((product) => ({ id: product.id, name: product.name, image: product.image, sales: product.sales ?? 0, revenueNet: null as number | null }));
  const productsForOverview = productPerformance.filter((product) => product.sales > 0).map((product) => ({
    ...product,
    revenueNet: product.revenueNet === null ? null : toUsd(product.revenueNet, overviewCurrency),
    approximate: overviewCurrency.trim().toUpperCase() !== "USD",
  }));
  const revenueSeries = (overview?.revenueSeries ?? []).flatMap((point) => {
    const revenueNet = toUsd(point.revenueNet, overviewCurrency);
    return revenueNet === null ? [] : [{ ...point, revenueNet }];
  });
  const campaignDailyUsd = campaignDaily.map((point) => ({
    ...point,
    spend: point.spend === null ? null : toUsd(point.spend, overviewCurrency),
    netRevenue: point.netRevenue === null ? null : toUsd(point.netRevenue, overviewCurrency),
  }));

  if (!storeId) return null;

  return (
    <div className="meta-detail-panel" style={{ display: "grid", gap: 18, margin: "18px 0" }}>
      <div className="app-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><span className="eyebrow">Meta</span><h2 style={{ margin: "2px 0 0" }}>{en ? "Detailed analysis" : "Analyse détaillée"}</h2></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select aria-label={t("overview.period")} value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
            <option value={7}>{t("overview.last7")}</option>
            <option value={30}>{t("overview.last30")}</option>
            <option value={90}>{t("overview.last90")}</option>
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? t("dashboard.refreshing") : t("dashboard.refresh")}</button>
        </div>
      </div>

      <section className="overview-economics">
        <div className="overview-economics-card app-card">
          <MetricHelp label={t("overview.customerValue")} description={t("overview.customerValueHelp")} />
          <strong>{overview?.customerValue === null || overview?.customerValue === undefined ? t("overview.soon") : formatMoneyInUSD(overview.customerValue, overviewCurrency) ?? t("overview.metricUnavailable")}</strong>
          <span className="overview-badge">{overview?.lowData ? t("overview.lowData") : t("overview.history")}</span>
        </div>
        <div className="overview-economics-card app-card">
          <MetricHelp label={t("overview.maxCostPerCustomer")} description={t("overview.maxCostPerCustomerHelp")} />
          <strong>{overview?.maxCostPerCustomer === null || overview?.maxCostPerCustomer === undefined ? t("overview.soon") : formatMoneyInUSD(overview.maxCostPerCustomer, overviewCurrency) ?? t("overview.metricUnavailable")}</strong>
          <span className="overview-badge">{Math.round((overview?.targetMargin ?? 0.3) * 100)} %</span>
        </div>
      </section>

      <MetaHistoryOverview
        account={metaAccount}
        storeId={storeId}
        confirmedSales={overview?.sales ?? 0}
        maxCostPerCustomer={overview?.maxCostPerCustomer ?? null}
        storeCurrency={overviewCurrency}
        onLaunch={onLaunchAd}
        onRefresh={() => { void refresh(); }}
        onDaily={setMetaDaily}
      />

      <OverviewDetails
        currency="USD"
        period={overview?.period ?? null}
        revenueSeries={revenueSeries}
        metaDaily={metaDaily}
        campaignDaily={campaignDailyUsd}
        products={productsForOverview}
        campaigns={performances.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          spend: campaign.spend === null ? null : toUsd(campaign.spend, adsCurrency),
          currency: "USD",
          approximate: adsCurrency.trim().toUpperCase() !== "USD",
          realRoas: campaign.realRoas,
          realSales: campaign.realSales,
          attributionReliable: campaign.attributionReliable,
          decision: campaign.decision,
          suggestedIncrease: campaign.suggestedIncrease,
        }))}
        kpis={{
          visits: data?.kpis.visits ?? 0,
          sales: overview?.sales ?? 0,
          conversionRate: data?.kpis.conversionRate ?? t("overview.metricUnavailable"),
        }}
      />
    </div>
  );
}
