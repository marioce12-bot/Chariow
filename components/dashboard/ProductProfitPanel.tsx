"use client";
import { profitDisplayName, profitDisplayReasons } from "@/lib/product-profit-presentation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "./Skeleton";
import CampaignProfitPanel from "./CampaignProfitPanel";
import { useI18n } from "@/lib/i18n/i18n";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";
type CurrencyAmount = { currency: string; amount: number | null };
type Advertising = {
  status?: string; reason?: string; linkedCampaigns?: number; spend?: number | null;
  spendByCurrency?: CurrencyAmount[]; metaPurchases?: number | null;
  metaValueByCurrency?: CurrencyAmount[]; currencyConverted?: boolean;
  // Helper's current normalized output; the API may map this to the display contract above.
  adSpendStatus?: string; adSpendReasons?: string[]; linkedCampaignCount?: number;
  adSpend?: number | null; adSpendByCurrency?: CurrencyAmount[];
  metaPurchaseValue?: number | null; metaCurrency?: string | null;
  metaConversionsByCurrency?: Array<{ currency: string; purchases: number | null; value: number | null }>;
};
type Product = {
  productId: string; productName: string | null; currency: string; units: number;
  grossRevenue: number | null; netRevenue: number | null; chariowFees: number | null;
  estimatedNetRevenue: boolean; chariowFeeRate: 0.15; profit: number | null; marginPercent: number | null;
  refunds?: number; campaigns?: Array<{ id: string; name: string | null; sales: number }>;
  provenance?: { paidSales: number; refundCount: number; campaignLinkedSales: number; reliability: "complete" | "partial" };
  advertising?: Advertising;
  adSpendStatus?: string; adSpendReasons?: string[]; linkedCampaignCount?: number;
  adSpend?: number | null; adSpendByCurrency?: CurrencyAmount[];
  metaPurchases?: number | null; metaPurchaseValue?: number | null; metaCurrency?: string | null;
  metaConversionsByCurrency?: Array<{ currency: string; purchases: number | null; value: number | null }>;
};
const money = (value: number | null, currency: string, locale: string) =>
  value == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
export default function ProductProfitPanel({ storeId }: { storeId: string | null }) {
  const { locale, t } = useI18n();
  const en = locale === "en";
  const copy = dashboardCopy[locale];
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(Boolean(storeId));
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!storeId) return;
    setError("");
    try {
      const res = await fetch(`/api/product-profit?storeId=${encodeURIComponent(storeId)}&period=${period}`, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chargement impossible");
      if (!signal?.aborted) setProducts(json.products);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : t("adsExtra.status.error"));
    }
  }, [storeId, period]);
  useEffect(() => {
    const controller = new AbortController(); setProducts([]); setError("");
    if (!storeId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void refresh(controller.signal).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, storeId]);
  const totals = useMemo(() => {
    const buckets = new Map<string, { net: number; hasNet: boolean; missingNet: boolean; profit: number; missingProfit: boolean }>();
    products.forEach((p) => {
      const b = buckets.get(p.currency) ?? { net: 0, hasNet: false, missingNet: false, profit: 0, missingProfit: false };
      if (p.netRevenue != null) { b.net += p.netRevenue; b.hasNet = true; } else b.missingNet = true;
      if (p.profit != null) b.profit += p.profit; else b.missingProfit = true;
      buckets.set(p.currency, b);
    });
    return [...buckets.entries()];
  }, [products]);
  if (!storeId) return <section style={box}><h2 style={title}>{copy["dashboardExtra.productProfit"]}</h2><p>{copy["dashboardExtra.selectStore"]}</p></section>;
  return <section className="profit-panel" aria-label={copy["dashboardExtra.productProfit"]} style={box}>
    <div style={head}><div style={{ flex: 1, minWidth: 240 }}>
      <span className="business-eyebrow">{copy["dashboardExtra.profitability"]}</span>
      <h2 style={title}>{copy["dashboardExtra.productProfit"]}</h2>
      <p style={muted}>{en ? "Chariow fees are 15%. Provided net revenue is used as-is, without deducting fees again; otherwise, net revenue is estimated at 85% of gross revenue." : "Les frais Chariow sont de 15 %. Si le montant net est fourni, il est utilisé tel quel sans nouvelle déduction des frais. À défaut, le net est estimé à 85 % du brut."}</p>
    </div><label style={periodLabel}>{en ? "Period" : "Période"}{" "}<select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="7">{en ? "7 days" : "7 jours"}</option><option value="30">{en ? "30 days" : "30 jours"}</option><option value="90">{en ? "90 days" : "90 jours"}</option></select></label></div>
    {error && <p role="alert" style={alert}>{en ? "Sales could not be loaded. Please try again." : "Impossible de charger les ventes. Réessayez dans un instant."}</p>}
    {loading ? <div role="status" aria-busy="true" aria-label={en ? "Loading sales" : "Chargement des ventes"} style={grid}>{[0, 1, 2].map((item) => <article key={item} style={card}><Skeleton width="55%" height={18} /><Skeleton width="80%" height={12} style={{ marginTop: 16 }} /><Skeleton width="70%" height={12} style={{ marginTop: 8 }} /><Skeleton width="90%" height={12} style={{ marginTop: 8 }} /><Skeleton width="60%" height={20} style={{ marginTop: 16 }} /></article>)}</div> : products.length === 0 && !error ? <p>{en ? "No confirmed sales with an identifiable product and currency for this period." : "Aucune vente confirmée avec produit et devise identifiables sur cette période."}</p> : null}
    {!loading && totals.length > 0 && <div style={totalsGrid}>{totals.map(([currency, total]) => {
      const explanations = [...new Set(products.filter(p => p.currency === currency && p.profit == null).flatMap(p => profitDisplayReasons(p, en)))];
      const summary = explanations.length <= 2 ? explanations.join(" ") : (en ? "Some sales, Meta spend or allocation data is incomplete for this period." : "Certaines données de ventes, de dépenses Meta ou de répartition sont incomplètes sur cette période.");
      return <article className="profit-summary" key={currency} style={totalCard}><b>{en ? "Period summary" : "Résumé de la période"} <span>{currency}</span></b><div className="profit-summary-metrics"><div><small>{en ? "Net after fees" : "Montant net après frais"}</small><strong>{total.hasNet && !total.missingNet ? money(total.net, currency, locale) : (en ? "Unavailable" : "Indisponible")}</strong></div><div className="profit-summary-result"><small>{en ? "Estimated profit" : "Bénéfice estimé"}</small><strong>{total.missingProfit ? (en ? "Unavailable" : "Indisponible") : money(total.profit, currency, locale)}</strong>{total.missingProfit && <p className="profit-unavailable-reason" style={{ ...muted, margin: "6px 0 0" }}>{summary}</p>}</div></div></article>;
    })}</div>}
    {!loading && <div style={grid}>{products.map((p) => {
      const key = `${p.productId}|${p.currency}`, ad = p.advertising;
      const spend = ad?.spend ?? ad?.adSpend ?? p.adSpend ?? null;
      const spendCurrencies = ad?.spendByCurrency ?? ad?.adSpendByCurrency ?? p.adSpendByCurrency ?? [];
      const conversions = ad?.metaConversionsByCurrency ?? p.metaConversionsByCurrency ?? [];
      const metaValues = ad?.metaValueByCurrency ?? conversions.map((x) => ({ currency: x.currency, amount: x.value }));
      const purchases = ad?.metaPurchases !== undefined ? ad.metaPurchases : p.metaPurchases !== undefined ? p.metaPurchases : conversions.length && conversions.every(x => x.purchases != null) ? conversions.reduce((sum, x) => sum + x.purchases!, 0) : null;
      const adStatus = ad?.status ?? ad?.adSpendStatus ?? p.adSpendStatus;
      const reasons = profitDisplayReasons(p, en);
      const metaUnavailable = purchases == null;
      const statusText = adStatus === "ambiguous" ? (en ? "Unallocated (multi-product campaign)" : "Non alloué (campagne multi-produits)") : adStatus === "complete" ? (en ? "Available" : "Disponible") : (en ? "Unavailable" : "Indisponible");
      return <article className="profit-product" key={key} style={card}>
        <div style={cardHead}><div><h3 style={productTitle}>{profitDisplayName(p.productName, en ? "Unnamed product" : "Produit sans nom")}</h3></div><span style={badge}>{p.currency}</span></div>
        {p.campaigns?.length ? <p style={muted}>{en ? "Individual Chariow order campaign metadata (not Meta attribution): " : "Métadonnées de campagne des commandes Chariow (pas une attribution Meta) : "}{p.campaigns.map((c) => `${profitDisplayName(c.name, en ? "Campaign" : "Campagne")} (${c.sales})`).join(", ")}</p> : <p style={muted}>{en ? "No individual campaign metadata on these orders. This does not affect product-linked campaign spend." : "Aucune métadonnée de campagne individuelle sur ces commandes. Cela ne remet pas en cause les campagnes associées au produit."}</p>}
        <div className="profit-product-stats" style={stats}>
          <span>{en ? "Chariow paid orders" : "Commandes payées Chariow"} <b>{p.provenance?.paidSales ?? p.units}</b></span>
          <span>{en ? "Orders with individual campaign metadata" : "Commandes avec métadonnées de campagne individuelles"} <b>{p.provenance?.campaignLinkedSales ?? 0}</b></span>
          <span>{en ? "Refunds" : "Remboursements"} <b>{p.provenance?.refundCount ?? p.refunds ?? 0}</b></span>
          <span>{t("finalExtra.text11")} <b>{money(p.grossRevenue, p.currency, locale)}</b></span>
          <span>{en ? `Chariow fees (${(p.chariowFeeRate * 100).toFixed(0)} %)` : `Frais Chariow (${(p.chariowFeeRate * 100).toFixed(0)} %)`} <b>{money(p.chariowFees, p.currency, locale)}</b></span>
          <span>{p.estimatedNetRevenue ? (en ? "Estimated net amount" : "Montant net estimé") : (en ? "Received net amount" : "Montant net reçu")} <b>{money(p.netRevenue, p.currency, locale)}</b></span>
        </div>
        <div style={{ ...stats, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          <span>{en ? "Explicitly linked campaign spend" : "Dépenses des campagnes explicitement liées"} <b>{spend == null ? statusText : money(spend, p.currency, locale)}</b></span>
          {spendCurrencies.filter((x) => spend == null || x.currency !== p.currency).map((x, i) => <span key={`${x.currency}-${i}`}>{en ? "Observed campaign spend (before allocation)" : "Dépenses observées des campagnes (avant allocation)"} ({x.currency}) <b>{x.amount == null ? (en ? "Unavailable" : "Indisponible") : money(x.amount, x.currency, locale)}</b></span>)}
          <span>{en ? "Meta purchase conversions (aggregate)" : "Conversions d’achats Meta (agrégées)"} <b>{metaUnavailable ? (en ? "Unavailable" : "Indisponible") : purchases}</b></span>
          {p.metaCurrency && !metaValues.length && p.metaPurchaseValue != null && <span>{en ? "Meta conversion value" : "Valeur des conversions Meta"} ({p.metaCurrency}) <b>{money(p.metaPurchaseValue, p.metaCurrency, locale)}</b></span>}
          {metaValues.map((x, i) => <span key={`${x.currency}-${i}`}>{en ? "Meta conversion value" : "Valeur des conversions Meta"} ({x.currency}) <b>{x.amount == null ? (en ? "Unavailable" : "Indisponible") : money(x.amount, x.currency, locale)}</b></span>)}
        </div>
        {p.provenance?.reliability === "partial" && <small role="note" style={muted}>{en ? "Incomplete financial data: some amounts are unavailable." : "Données financières incomplètes : certains montants ne sont pas disponibles."}</small>}
        <div className="profit-product-result" style={p.profit == null ? { ...profitRow, background: "#f6f7f9", color: "#475569" } : profitRow}>
          <div><strong>{`${en ? "Estimated profit" : "Bénéfice estimé"}: ${p.profit == null ? (en ? "Unavailable" : "Indisponible") : money(p.profit, p.currency, locale)}`}</strong>{p.profit == null && <p className="profit-unavailable-reason" style={{ ...muted, margin: "6px 0 0" }}>{reasons[0]}</p>}</div>
          <span>{en ? "Indicative margin:" : "Taux indicatif :"} {p.marginPercent == null ? "—" : `${p.marginPercent.toFixed(1)} %`}</span>
        </div>
        <details className="profit-details" style={{ ...muted, margin: "10px 0 0" }}><summary style={{ cursor: "pointer" }}>{en ? "About this estimate" : "Comprendre cette estimation"}</summary>
          {p.profit == null && <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
          <p>{en ? "Meta conversions are aggregate metrics; they do not prove individual Chariow orders." : "Les conversions Meta sont agrégées ; elles ne prouvent pas les commandes Chariow une par une."}</p>
          <p>{en ? "Profit uses net after Chariow fees, existing costs and only product-linked campaign spend. Different currencies remain separate, with no automatic conversion. This estimate is indicative." : "Le bénéfice utilise le net après frais Chariow, les coûts existants et les dépenses des campagnes associées au produit. Les devises restent séparées, sans conversion automatique. Cette estimation est indicative."}</p>
        </details>
      </article>;
    })}</div>}
    <CampaignProfitPanel key={`${storeId}:${period}`} storeId={storeId} period={Number(period) as 7 | 30 | 90} />
  </section>;
}
const box: React.CSSProperties = { background: "transparent", padding: 0, color: "#192434" };
const title: React.CSSProperties = { margin: "0 0 7px", fontSize: 28, letterSpacing: "-.04em" };
const muted: React.CSSProperties = { color: "#6b7280", fontSize: 12, lineHeight: 1.7, margin: "0 0 12px" };
const head: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" };
const periodLabel: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap", fontSize: 12 };
const alert: React.CSSProperties = { color: "#b42318" };
const totalsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, margin: "16px 0" };
const totalCard: React.CSSProperties = { display: "grid", gap: 16, padding: 22, background: "white", border: "1px solid #e2e8f0", borderRadius: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 14, marginTop: 14 };
const card: React.CSSProperties = { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, minWidth: 0 };
const cardHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" };
const productTitle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 650, overflowWrap: "anywhere" };
const badge: React.CSSProperties = { background: "#eef2ff", color: "#3730a3", padding: "4px 8px", borderRadius: 99, fontSize: 12 };
const stats: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, margin: "16px 0" };
const profitRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: 10, borderRadius: 8, background: "#f0fdf4" };
