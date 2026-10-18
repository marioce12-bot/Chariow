"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "./Skeleton";
import CampaignProfitPanel from "./CampaignProfitPanel";
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
const money = (value: number | null, currency: string) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
export default function ProductProfitPanel({
  storeId,
}: {
  storeId: string | null;
}) {
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
          setError(e instanceof Error ? e.message : "Erreur");
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
        <h2 style={title}>Bénéfice estimé par produit</h2>
        <p>Sélectionnez une boutique pour consulter ses ventes.</p>
      </section>
    );
  return (
    <section
      className="profit-panel"
      aria-label="Bénéfices estimés par produit"
      style={box}
    >
      <div style={head}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="business-eyebrow">RENTABILITÉ</span>
          <h2 style={title}>Bénéfice estimé par produit</h2>
          <p style={muted}>
            Les frais Chariow sont de 15 %. Si le montant net est fourni, il est
            utilisé tel quel sans nouvelle déduction des frais. À défaut, le net
            est estimé à 85 % du brut.
          </p>
        </div>
        <label style={periodLabel}>
          Période{" "}
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">7 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" style={alert}>
          {error}
        </p>
      )}
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Chargement des ventes" style={grid}>
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
          Aucune vente confirmée avec produit et devise identifiables sur cette
          période.
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
                Résumé de la période <span>{currency}</span>
              </b>
              <div className="profit-summary-metrics">
                <div>
                  <small>Montant net après frais</small>
                  <strong>
                    {t.missing ? "Données incomplètes" : money(t.net, currency)}
                  </strong>
                </div>
                <div className="profit-summary-result">
                  <small>Bénéfice estimé</small>
                  <strong>
                    {t.missing ? "À compléter" : money(t.profit, currency)}
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
                      <small style={muted}>ID : {p.productId}</small>
                    )}
                  </div>
                  <span style={badge}>{p.currency}</span>
                </div>
                {p.campaigns?.length ? <p style={muted}>Campagne Chariow liée : {p.campaigns.map((c) => `${c.name || c.id} (${c.sales})`).join(", ")}</p> : <p style={muted}>Aucune campagne Chariow explicitement liée à ces ventes.</p>}
                <div className="profit-product-stats" style={stats}>
                  <span>
                    Ventes payées <b>{p.provenance?.paidSales ?? p.units}</b>
                  </span>
                  <span>Remboursements <b>{p.provenance?.refundCount ?? p.refunds ?? 0}</b></span>
                  <span>
                    Brut <b>{money(p.grossRevenue, p.currency)}</b>
                  </span>
                  <span>
                    Frais Chariow ({(p.chariowFeeRate * 100).toFixed(0)} %)
                    <b>{money(p.chariowFees, p.currency)}</b>
                  </span>
                  <span>
                    {p.estimatedNetRevenue ? "Montant net estimé" : "Montant net reçu"}
                    <b>{money(p.netRevenue, p.currency)}</b>
                  </span>
                </div>
                {p.provenance?.reliability === "partial" && <small role="note" style={muted}>Données financières incomplètes : certains montants ne sont pas disponibles.</small>}
                <div className="profit-product-result" style={profitRow}>
                  <strong>
                    {p.profit == null ? "Bénéfice réel indisponible (dépenses publicitaires non attribuées)" : `Bénéfice estimé : ${money(p.profit, p.currency)}`}
                  </strong>
                  <span>
                    Marge :{" "}
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
      <CampaignProfitPanel storeId={storeId} period={Number(period) as 7 | 30 | 90} />
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
