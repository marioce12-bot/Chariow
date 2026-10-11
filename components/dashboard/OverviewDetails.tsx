"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";

type RevenuePoint = { date: string; revenueNet: number };
type SpendPoint = { date: string; spend: number | null };
type CampaignDailyPoint = { date: string; spend: number | null; netRevenue: number | null; campaigns: number };
type ProductPoint = { id: string; name: string; image: string | null; sales: number; revenueNet: number | null };
type CampaignPoint = {
  id: string;
  name: string;
  spend: number;
  currency: string;
  realRoas: number | null;
  attributionReliable: boolean;
  decision: "pause" | "keep_running" | "learning" | "insufficient_data";
  suggestedIncrease: number | null;
};
type Props = {
  currency: string;
  period: { from: string; to: string } | null;
  revenueSeries: RevenuePoint[];
  metaDaily: SpendPoint[];
  campaignDaily: CampaignDailyPoint[];
  products: ProductPoint[];
  campaigns: CampaignPoint[];
  kpis: { visits: number; sales: number; conversionRate: string };
};

type CampaignFilter = "cut" | "increase" | null;

export function OverviewDetails({ currency, period, revenueSeries, metaDaily, campaignDaily, products, campaigns, kpis }: Props) {
  const { t } = useI18n();
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>(null);
  const inPeriodSpend = metaDaily.filter((point) => (!period || (point.date >= period.from && point.date <= period.to)) && point.spend !== null);
  const revenueByDate = new Map(revenueSeries.map((point) => [point.date, point.revenueNet]));
  const spendByDate = new Map(inPeriodSpend.map((point) => [point.date, point.spend ?? 0]));
  const dates = [...new Set([...revenueByDate.keys(), ...spendByDate.keys()])].sort();
  const hasRevenue = revenueSeries.some((point) => point.revenueNet > 0);
  const hasSpend = inPeriodSpend.some((point) => (point.spend ?? 0) > 0);
  const maxValue = Math.max(1, ...dates.flatMap((date) => [revenueByDate.get(date) ?? 0, spendByDate.get(date) ?? 0]));
  const pointsFor = (values: Map<string, number>) => dates.map((date, index) => {
    const x = dates.length > 1 ? (index / (dates.length - 1)) * 100 : 50;
    const y = 46 - ((values.get(date) ?? 0) / maxValue) * 40;
    return `${x},${y}`;
  }).join(" ");
  const cutCount = campaigns.filter((campaign) => campaign.decision === "pause").length;
  const increaseCount = campaigns.filter((campaign) => campaign.attributionReliable && campaign.realRoas !== null && campaign.realRoas >= 1 && (campaign.suggestedIncrease ?? 0) > 0).length;
  const visibleCampaigns = campaigns.filter((campaign) => campaignFilter === "cut"
    ? campaign.decision === "pause"
    : campaignFilter === "increase"
      ? campaign.attributionReliable && campaign.realRoas !== null && campaign.realRoas >= 1 && (campaign.suggestedIncrease ?? 0) > 0
      : true);
  const maxProductRevenue = Math.max(1, ...products.map((product) => product.revenueNet ?? 0));
  const campaignDates = [...new Set(campaignDaily.map((point) => point.date))].sort();
  const hasCampaignSpend = campaignDaily.some((point) => (point.spend ?? 0) > 0);
  const hasCampaignRevenue = campaignDaily.some((point) => (point.netRevenue ?? 0) !== 0);
  const campaignMax = Math.max(1, ...campaignDaily.flatMap((point) => [point.spend ?? 0, point.netRevenue ?? 0]));
  const campaignPointsFor = (key: "spend" | "netRevenue") => campaignDaily.map((point, index) => {
    const x = campaignDates.length > 1 ? (index / (campaignDates.length - 1)) * 100 : 50;
    const y = 46 - ((point[key] ?? 0) / campaignMax) * 40;
    return `${x},${y}`;
  }).join(" ");

  const verdict = (campaign: CampaignPoint) => {
    if (campaign.decision === "pause") return { key: "loss", tone: "loss" };
    if (campaign.attributionReliable && campaign.realRoas !== null && campaign.realRoas >= 1) return { key: "gain", tone: "gain" };
    if (!campaign.attributionReliable || campaign.decision === "learning" || campaign.decision === "insufficient_data") return { key: "testing", tone: "testing" };
    return { key: "watch", tone: "watch" };
  };

  return (
    <div className="overview-details-grid">
      <section className="overview-detail-card app-card overview-daily-chart">
        <div className="card-head"><h2>{t("overview.netRevenueByDay")}</h2></div>
        {dates.length && (hasRevenue || hasSpend) ? (
          <svg className="overview-details-svg" viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label={t("overview.netRevenueByDay")}>
            <line x1="0" x2="100" y1="46" y2="46" className="overview-chart-axis" />
            {hasRevenue ? <polyline points={pointsFor(revenueByDate)} className="overview-chart-revenue" /> : null}
            {hasSpend ? <polyline points={pointsFor(spendByDate)} className="overview-chart-spend" /> : null}
          </svg>
        ) : <div className="overview-detail-empty">-</div>}
        <div className="overview-chart-legend">
          {hasRevenue ? <span><i className="legend-net" />{t("overview.netRevenue")}</span> : null}
          {hasSpend ? <span><i className="legend-spend" />{t("overview.spend")} <small className="source-meta">{t("overview.metaDeclared")}</small></span> : null}
        </div>
      </section>

      <section className="overview-detail-card app-card overview-products">
        <div className="card-head"><h2>{t("dashboard.bestProducts")}</h2></div>
        {products.length ? <div className="overview-product-list">{products.slice(0, 5).map((product) => {
          const width = product.revenueNet === null ? 0 : Math.max(0, Math.min(100, (product.revenueNet / maxProductRevenue) * 100));
          return <div className="overview-product-row" key={product.id}>
            {product.image ? <img className="overview-product-image" src={product.image} alt="" /> : <span className="overview-product-image overview-product-placeholder" />}
            <div className="overview-product-content"><div className="overview-product-heading"><strong>{product.name}</strong><span>{product.sales} {t("overview.sales")} · {product.revenueNet === null ? "-" : `${formatMoney(product.revenueNet, currency)} ${t("overview.netRevenue")}`}</span></div><i className="overview-product-track"><b style={{ width: `${width}%` }} /></i></div>
          </div>;
        })}</div> : <div className="overview-detail-empty">-</div>}
      </section>

      <section className="overview-detail-card app-card overview-funnel">
        <div className="card-head"><h2>{t("overview.funnel")}</h2></div>
        <div className="overview-funnel-grid">
          <div><span>{t("overview.visits")}</span><strong>{kpis.visits > 0 ? kpis.visits.toLocaleString() : "-"}</strong></div>
          <div><span>{t("overview.purchases")}</span><strong>{kpis.visits > 0 || kpis.sales > 0 ? kpis.sales.toLocaleString() : "-"}</strong></div>
          <div><span>{t("overview.conversionRate")}</span><strong>{kpis.visits > 0 ? kpis.conversionRate : "-"}</strong></div>
        </div>
      </section>

      <section className="overview-detail-card app-card overview-campaigns">
        <div className="card-head"><h2>{t("overview.campaigns")}</h2></div>
        {cutCount || increaseCount ? <div className="overview-action-pills">
          {cutCount ? <button type="button" className={campaignFilter === "cut" ? "is-active" : ""} aria-pressed={campaignFilter === "cut"} onClick={() => setCampaignFilter(campaignFilter === "cut" ? null : "cut")}>{t("overview.cutAction")} <b>{cutCount}</b></button> : null}
          {increaseCount ? <button type="button" className={campaignFilter === "increase" ? "is-active" : ""} aria-pressed={campaignFilter === "increase"} onClick={() => setCampaignFilter(campaignFilter === "increase" ? null : "increase")}>{t("overview.increaseAction")} <b>{increaseCount}</b></button> : null}
        </div> : null}
        {visibleCampaigns.length ? <div className="overview-campaign-list">{visibleCampaigns.map((campaign) => {
          const state = verdict(campaign);
          return <div className="overview-campaign-row" key={campaign.id}>
            <strong className="overview-campaign-name">{campaign.name}</strong>
            <div><span>{t("overview.spend")}</span><strong>{formatMoney(campaign.spend, campaign.currency)}</strong><small className="source-meta">{t("overview.metaDeclared")}</small></div>
            <div><span>{t("overview.profitability")}</span><strong>{campaign.attributionReliable && campaign.realRoas !== null ? `${(campaign.realRoas * 100).toFixed(1)} %` : "-"}</strong><small className="source-verified">{t("overview.verified")}</small></div>
            <span className={`overview-campaign-verdict verdict-${state.tone}`}>{t(`overview.${state.key}`)}</span>
          </div>;
        })}</div> : <div className="overview-detail-empty">-</div>}
        {campaignDaily.length && (hasCampaignSpend || hasCampaignRevenue) ? <div className="overview-campaign-daily">
          <div className="meta-history-title"><strong>{t("overview.dailyCampaigns")}</strong></div>
          <svg className="overview-details-svg overview-campaign-svg" viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label={t("overview.dailyCampaigns")}>
            <line x1="0" x2="100" y1="46" y2="46" className="overview-chart-axis" />
            {hasCampaignSpend ? <polyline points={campaignPointsFor("spend")} className="overview-chart-spend" /> : null}
            {hasCampaignRevenue ? <polyline points={campaignPointsFor("netRevenue")} className="overview-chart-revenue" /> : null}
          </svg>
          <div className="overview-chart-legend">
            {hasCampaignSpend ? <span><i className="legend-spend" />{t("overview.spend")} <small className="source-meta">{t("overview.metaDeclared")}</small></span> : null}
            {hasCampaignRevenue ? <span><i className="legend-net" />{t("overview.netRevenue")} <small className="source-verified">{t("overview.verified")}</small></span> : null}
          </div>
        </div> : null}
      </section>
    </div>
  );
}
