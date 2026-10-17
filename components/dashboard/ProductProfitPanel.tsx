"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
type Product = {
  productId: string;
  productName: string | null;
  currency: string;
  units: number;
  grossRevenue: number;
  netRevenue: number | null;
  chariowFees: number | null;
  estimatedNetRevenue: boolean;
  chariowFeeRate: 0.15;
  totalCosts: number | null;
  profit: number | null;
  marginPercent: number | null;
  costStatus: "complete" | "incomplete";
};
type Cost = {
  product_id: string;
  currency: string;
  unit_cost: number;
  fee_per_sale: number;
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
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(Boolean(storeId));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [period, setPeriod] = useState("30");
  const [draft, setDraft] = useState<
    Record<string, { unitCost: string; feePerSale: string }>
  >({});
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
          setCosts(json.costs);
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
    setCosts([]);
    setDraft({});
    setError("");
    setSaved("");
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
      { net: number; costs: number; profit: number; missing: boolean }
    >();
    products.forEach((p) => {
      const b = buckets.get(p.currency) ?? {
        net: 0,
        costs: 0,
        profit: 0,
        missing: false,
      };
      if (p.netRevenue == null) b.missing = true;
      else b.net += p.netRevenue;
      if (p.totalCosts != null) b.costs += p.totalCosts;
      else b.missing = true;
      if (p.profit != null) b.profit += p.profit;
      else b.missing = true;
      buckets.set(p.currency, b);
    });
    return [...buckets.entries()];
  }, [products]);
  async function save(
    product: Product,
    key: string,
    values: { unitCost: string; feePerSale: string },
  ) {
    const parsed = [values.unitCost, values.feePerSale].map((v) =>
      v.trim() === "" ? NaN : Number(v),
    );
    if (
      parsed.some(
        (v) =>
          !Number.isFinite(v) ||
          v < 0 ||
          v > 999999999999.99 ||
          Math.abs(Math.round(v * 100) - v * 100) >
            Math.max(1e-7, Number.EPSILON * Math.abs(v * 100) * 2),
      )
    ) {
      setError(
        "Saisissez les deux coûts, entre 0 et 999999999999,99, avec au plus deux décimales. 0 est accepté explicitement.",
      );
      return;
    }
    setSaving(key);
    setSaved("");
    setError("");
    try {
      const res = await fetch("/api/product-profit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          productId: product.productId,
          currency: product.currency,
          unitCost: parsed[0],
          feePerSale: parsed[1],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible");
      setSaved(
        `${product.productName || product.productId} · ${product.currency} : coûts enregistrés.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(null);
    }
  }
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
            Le net inclut les frais Chariow (15 %) automatiquement : ceux-ci ne
            sont jamais déduits une seconde fois. Si le net réel est indisponible,
            il est estimé à 85 % du brut. Le coût de fabrication est distinct du
            prix de vente; saisissez vos coûts réels, hors frais Chariow.
            Estimation avant dépenses publicitaires non ventilées.
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
      {saved && (
        <p role="status" style={success}>
          {saved}
        </p>
      )}
      {loading ? (
        <p aria-live="polite">Chargement des ventes…</p>
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
                <div>
                  <small>Fabrication et autres frais</small>
                  <strong>{money(t.costs, currency)}</strong>
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
            const key = `${p.productId}|${p.currency}`,
              cost = costs.find(
                (c) =>
                  c.product_id === p.productId && c.currency === p.currency,
              );
            const val = draft[key] ?? {
              unitCost: cost ? String(cost.unit_cost) : "0",
              feePerSale: cost ? String(cost.fee_per_sale) : "0",
            };
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
                <div className="profit-product-stats" style={stats}>
                  <span>
                    Ventes <b>{p.units}</b>
                  </span>
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
                  <span>
                    Fabrication et autres frais <b>{money(p.totalCosts, p.currency)}</b>
                  </span>
                </div>
                <div className="profit-product-result" style={profitRow}>
                  <strong>
                    Bénéfice estimé : {money(p.profit, p.currency)}
                  </strong>
                  <span>
                    Marge :{" "}
                    {p.marginPercent == null
                      ? "—"
                      : `${p.marginPercent.toFixed(1)} %`}
                  </span>
                </div>
                <div style={editGrid}>
                  <label>
                    Coût de fabrication unitaire
                    <input
                      aria-label={`Coût unitaire ${p.productName || p.productId} ${p.currency}`}
                      type="number"
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      placeholder="0 par défaut"
                      value={val.unitCost}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [key]: { ...val, unitCost: e.target.value },
                        }))
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    Frais supplémentaires / vente
                    <input
                      aria-label={`Frais par vente ${p.productName || p.productId} ${p.currency}`}
                      type="number"
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      placeholder="0 par défaut"
                      value={val.feePerSale}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [key]: { ...val, feePerSale: e.target.value },
                        }))
                      }
                      style={input}
                    />
                  </label>
                </div>
                <p style={note}>
                  Le coût de fabrication n’est pas le prix de vente. Ces champs
                  sont facultatifs (0 par défaut) et concernent uniquement vos
                  coûts hors frais Chariow, déjà inclus dans le net ci-dessus.
                </p>
                <button
                  disabled={saving !== null}
                  onClick={() => void save(p, key, val)}
                  style={button}
                >
                  {saving === key ? "Enregistrement…" : "Enregistrer les coûts"}
                </button>
              </article>
            );
          })}
        </div>
      )}
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
const success: React.CSSProperties = { color: "#067647" };
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
const editGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
  gap: 10,
  marginTop: 14,
};
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 8,
  marginTop: 4,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};
const note: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 7,
  padding: "9px 12px",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
};
