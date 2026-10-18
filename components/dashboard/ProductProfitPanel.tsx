"use client";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "./Skeleton";
import CampaignProfitPanel from "./CampaignProfitPanel";
import { TrackingQualityPanel } from "./TrackingQualityPanel";
import { useI18n } from "@/lib/i18n/i18n";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";
type Product = {
  productId: string;
  productName: string | null;
  currency: string;
  units: number;
  grossRevenue: number | null;
  netRevenue: number | null;
  chariowFees: number | null;
  estimatedNetRevenue: boolean;
  chariowFeeRate: 0.15;
  profit: number | null;
  marginPercent: number | null;
  refunds?: number;
  campaigns?: Array<{ id: string; name: string | null; sales: number }>;
  provenance?: { paidSales: number; refundCount: number; campaignLinkedSales: number; reliability: "complete" | "partial" };
};
const money = (value: number | null, currency: string, locale: string) =>
  value == null
    ? "—"
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
export default function ProductProfitPanel({
  storeId,
}: {
  storeId: string | null;
}) {
  const { locale , t } = useI18n();
  const en = locale === "en";
  const copy = dashboardCopy[locale];
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(Boolean(storeId));
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!storeId) return;
      setError("");
      try {
        const res = await fetch(
          `/api/product-profit?storeId=${encodeURIComponent(storeId)}&period=${period}`,
          { signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Chargement impossible");
        if (!signal?.aborted) {
          setProducts(json.products);
        }
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : t("adsExtra.status.error"));
      }
    },
    [storeId, period],
  );
  useEffect(() => {
    const controller = new AbortController();
    setProducts([]);
    setError("");
    if (!storeId) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void refresh(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refresh, storeId]);
  const totals = useMemo(() => {
    const buckets = new Map<
      string,
      { net: number; profit: number; missing: boolean }
    >();
    products.forEach((p) => {
      const b = buckets.get(p.currency) ?? {
        net: 0,
        profit: 0,
        missing: false,
      };
      if (p.netRevenue == null) b.missing = true;
      else b.net += p.netRevenue;
      if (p.profit != null) b.profit += p.profit;
      else b.missing = true;
      buckets.set(p.currency, b);
    });
    return [...buckets.entries()];
  }, [products]);
  if (!storeId)
    return (
      <section style={box}>
        <h2 style={title}>{copy["dashboardExtra.productProfit"]}</h2>
        <p>{copy["dashboardExtra.selectStore"]}</p>
      </section>
    );
  return (
    <section
      className="profit-panel"
      aria-label={copy["dashboardExtra.productProfit"]}
      style={box}
    >
      <div style={head}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="business-eyebrow">{copy["dashboardExtra.profitability"]}</span>
          <h2 style={title}>{copy["dashboardExtra.productProfit"]}</h2>
          <p style={muted}>
            {en ? "Chariow fees are 15%. Provided net revenue is used as-is, without deducting fees again; otherwise, net revenue is estimated at 85% of gross revenue." : `Les frais Chariow sont de 15 %. Si le montant net est fourni, il est
            utilisé tel quel sans nouvelle déduction des frais. À défaut, le net
            est estimé à 85 % du brut.`}
          </p>
        </div>
        <label style={periodLabel}>
          {en ? "Period" : "Période"}{" "}
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">{en ? "7 days" : "7 jours"}</option>
            <option value="30">{en ? "30 days" : "30 jours"}</option>
            <option value="90">{en ? "90 days" : "90 jours"}</option>
          </select>
        </label>
      </div>
      <TrackingQualityPanel key={`${storeId}-${period}`} storeId={storeId} periodDays={Number(period)} />
      {error && (
        <p role="alert" style={alert}>
          {localizeSystemMessage(error, locale)}
        </p>
      )}
      {loading ? (
        <div role="status" aria-busy="true" aria-label={en ? "Loading sales" : "Chargement des ventes"} style={grid}>
          {[0, 1, 2].map((item) => (
            <article key={item} style={card}>
              <Skeleton width="55%" height={18} />
              <Skeleton width="80%" height={12} style={{ marginTop: 16 }} />
              <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
              <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
              <Skeleton width="60%" height={20} style={{ marginTop: 16 }} />
            </article>
          ))}
        </div>
      ) : products.length === 0 && !error ? (
        <p>
          {en ? "No confirmed sales with an identifiable product and currency for this period." : `Aucune vente confirmée avec produit et devise identifiables sur cette
          période.`}
        </p>
      ) : null}
      {!loading && totals.length > 0 && (
        <div style={totalsGrid}>
          {totals.map(([currency, t]) => (
            <article
              className="profit-summary"
              key={currency}
              style={totalCard}
            >
              <b>
                {en ? "Period summary" : "Résumé de la période"} <span>{currency}</span>
              </b>
              <div className="profit-summary-metrics">
                <div>
                  <small>{en ? "Net after fees" : "Montant net après frais"}</small>
                  <strong>
                    {t.missing ? (en ? "Incomplete data" : "Données incomplètes") : money(t.net, currency, locale)}
                  </strong>
                </div>
                <div className="profit-summary-result">
                  <small>{en ? "Estimated profit" : "Bénéfice estimé"}</small>
                  <strong>
                    {t.missing ? (en ? "Needs completion" : "À compléter") : money(t.profit, currency, locale)}
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && (
        <div style={grid}>
          {products.map((p) => {
            const key = `${p.productId}|${p.currency}`;
            return (
              <article className="profit-product" key={key} style={card}>
                <div style={cardHead}>
                  <div>
                    <h3 style={productTitle}>{p.productName || p.productId}</h3>
                    {p.productName && (
                      <small style={muted}>{en ? "ID:" : "ID :"} {p.productId}</small>
                    )}
                  </div>
                  <span style={badge}>{p.currency}</span>
                </div>
                {p.campaigns?.length ? <p style={muted}>{en ? "Linked Chariow campaign: " : "Campagne Chariow liée :"} {p.campaigns.map((c) => `${c.name || c.id} (${c.sales})`).join(", ")}</p> : <p style={muted}>{en ? "No Chariow campaign is explicitly linked to these sales." : "Aucune campagne Chariow explicitement liée à ces ventes."}</p>}
                <div className="profit-product-stats" style={stats}>
                  <span>
                    {en ? "Paid sales" : "Ventes payées"} <b>{p.provenance?.paidSales ?? p.units}</b>
                  </span>
                  <span>{en ? "Refunds" : "Remboursements"} <b>{p.provenance?.refundCount ?? p.refunds ?? 0}</b></span>
                  <span>
                    {t("finalExtra.text11")}{" "}<b>{money(p.grossRevenue, p.currency, locale)}</b>
                  </span>
                  <span>
                    {en ? "Chariow fees (" : "Frais Chariow ("}{(p.chariowFeeRate * 100).toFixed(0)} %)
                    <b>{money(p.chariowFees, p.currency, locale)}</b>
                  </span>
                  <span>
                    {p.estimatedNetRevenue ? (en ? "Estimated net amount" : "Montant net estimé") : (en ? "Received net amount" : "Montant net reçu")}
                    <b>{money(p.netRevenue, p.currency, locale)}</b>
                  </span>
                </div>
                {p.provenance?.reliability === "partial" && <small role="note" style={muted}>{en ? "Incomplete financial data: some amounts are unavailable." : "Données financières incomplètes : certains montants ne sont pas disponibles."}</small>}
                <div className="profit-product-result" style={p.profit == null ? { ...profitRow, background: "#f6f7f9", color: "#475569" } : profitRow}>
                  <strong>
                    {p.profit == null
                      ? p.netRevenue == null
                        ? en ? "Profit after advertising not calculated: sales amounts are incomplete." : "Bénéfice après publicité non calculé : montants de vente incomplets."
                        : en ? "Profit after advertising: spend is not matched to this product." : "Bénéfice après publicité : dépenses non rapprochées de ce produit."
                      : `${en ? "Estimated profit" : "Bénéfice estimé"}: ${money(p.profit, p.currency, locale)}`}
                  </strong>
                  {p.profit == null && p.netRevenue != null && <small>{en ? "The net amount above is after Chariow fees, but before advertising. Vendeo cannot yet determine which ad spend belongs to this product. This does not mean your pixel is installed incorrectly." : "Le montant net ci-dessus est calculé après les frais Chariow, mais avant la publicité. Vendeo ne sait pas encore quelles dépenses publicitaires affecter à ce produit. Cela ne signifie pas que ton pixel est mal installé."}</small>}
                  <span>
                    {en ? "Margin:" : "Marge :"}{" "}
                    {p.marginPercent == null
                      ? "—"
                      : `${p.marginPercent.toFixed(1)} %`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CampaignProfitPanel key={`${storeId}:${period}`} storeId={storeId} period={Number(period) as 7 | 30 | 90} />
    </section>
  );
}
const box: React.CSSProperties = {
  background: "transparent",
  padding: 0,
  color: "#192434",
};
const title: React.CSSProperties = {
  margin: "0 0 7px",
  fontSize: 28,
  letterSpacing: "-.04em",
};
const muted: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  lineHeight: 1.7,
  margin: "0 0 12px",
};
const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};
const periodLabel: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 12,
};
const alert: React.CSSProperties = { color: "#b42318" };
const totalsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 10,
  margin: "16px 0",
};
const totalCard: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 22,
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
  gap: 14,
  marginTop: 14,
};
const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  minWidth: 0,
};
const cardHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};
const productTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 650,
  overflowWrap: "anywhere",
};
const badge: React.CSSProperties = {
  background: "#eef2ff",
  color: "#3730a3",
  padding: "4px 8px",
  borderRadius: 99,
  fontSize: 12,
};
const stats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 8,
  margin: "16px 0",
};
const profitRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
  padding: 10,
  borderRadius: 8,
  background: "#f0fdf4",
};
