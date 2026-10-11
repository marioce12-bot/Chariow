"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Megaphone, Package, Plus, XCircle } from "lucide-react";
import { formatMoney, formatMoneyInUSD } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { PlanId } from "@/lib/plans";
import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";
import { AdSpendByChannel } from "./AdSpendByChannel";
import { ChannelBadge } from "./shared";
import type { AnalyticsData, ProductData, StoreData, SubscriptionData } from "./shared";

/**
 * Nouvelle "Vue d'ensemble" : simple, accueillante et multi-canaux.
 *
 * Elle remplace l'ancien écran centré sur Meta (MetaHistoryOverview / OverviewDetails),
 * dont le détail reste disponible dans l'onglet Pub. Elle répond à 4 questions :
 *  1. Où j'en suis ? (bilan de la période)
 *  2. Que font mes campagnes et combien coûtent-elles, tous canaux confondus ?
 *  3. Que vend ma boutique ? (catalogue)
 *  4. Que se passe-t-il côté achats ? (réussis / en attente / échoués)
 */

type CampaignSummary = { id: string; platform: string; status: string };
type SaleGroup = "success" | "pending" | "failed";
type SaleRow = { key: string; group: SaleGroup; label: string; product: string; amount: string; date: string };
type PersistentAlert = { id: string; severity: string; title: string; description: string };

const CHANNELS = [
  { id: "meta", badge: "facebook", label: "Meta" },
  { id: "tiktok", badge: "tiktok", label: "TikTok" },
  { id: "pinterest", badge: "pinterest", label: "Pinterest" },
] as const;

const SUCCESS_STATUSES = ["completed", "settled", "paid", "succeeded", "success"];
const PENDING_STATUSES = ["awaiting_payment", "pending", "processing"];

const tileStyle: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const gridStyle = (min: number): React.CSSProperties => ({ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` });

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function OverviewHome({
  stores,
  subscription,
  analytics,
  userFirstName,
  plan,
  selectedStoreId,
  onStoreChange,
  onLaunchAd,
  onGoToAds,
  onGoToAI,
  campaignsVersion,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string;
  plan: PlanId;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  onLaunchAd: () => void;
  onGoToAds: () => void;
  onGoToAI: () => void;
  campaignsVersion: number;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const tr = (fr: string, english: string) => (en ? english : fr);

  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<AnalyticsData>(analytics);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [alerts, setAlerts] = useState<PersistentAlert[]>([]);

  const store = stores.find((item) => item.id === selectedStoreId) ?? stores[0];
  const storeId = store?.id ?? selectedStoreId;

  useEffect(() => { setData(analytics); }, [analytics]);

  // Période : on recharge les chiffres de la boutique pour 7 / 30 / 90 jours.
  useEffect(() => {
    if (!selectedStoreId) return;
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - periodDays + 1);
    let cancelled = false;
    void fetch(`/api/analytics?store_id=${encodeURIComponent(selectedStoreId)}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => { if (!cancelled && result?.snapshot) setData(result.snapshot as AnalyticsData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [periodDays, selectedStoreId]);

  // Campagnes de tous les canaux (Meta, TikTok, Pinterest…).
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ad-campaigns")
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => { if (!cancelled) setCampaigns(Array.isArray(result?.campaigns) ? result.campaigns : []); })
      .catch(() => { if (!cancelled) setCampaigns([]); });
    return () => { cancelled = true; };
  }, [campaignsVersion]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/alerts")
      .then((res) => (res.ok ? res.json() : { alerts: [] }))
      .then((result) => { if (!cancelled) setAlerts(Array.isArray(result?.alerts) ? result.alerts : []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const overview = data?.overview ?? null;
  const products: ProductData[] = data?.products ?? analytics?.products ?? [];
  const currency = overview?.currency ?? products[0]?.currency ?? "XOF";
  const salesCount = overview?.sales ?? data?.kpis.sales ?? 0;
  const money = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatMoneyInUSD(value, currency) ?? "—");

  const activeCampaigns = campaigns.filter((c) => c.status === "active" || c.status === "review");
  const problemCampaigns = campaigns.filter((c) => c.status === "error" || c.status === "rejected");

  // Événements d'achat : réussis / en attente / échoués.
  const saleRows: SaleRow[] = useMemo(() => {
    const labels: Record<string, [string, string]> = {
      completed: ["Vente réussie", "Successful sale"],
      settled: ["Vente réglée", "Settled sale"],
      awaiting_payment: ["Paiement en attente", "Awaiting payment"],
      pending: ["Paiement en attente", "Awaiting payment"],
      failed: ["Paiement échoué", "Payment failed"],
      abandoned: ["Achat abandonné", "Abandoned purchase"],
      refunded: ["Remboursement", "Refund"],
      cancelled: ["Achat annulé", "Cancelled purchase"],
    };
    const rows = (data?.sales ?? []).map((sale, index): SaleRow & { time: number } => {
      const row = rec(sale);
      const status = String(row.status ?? row.state ?? "unknown").toLowerCase();
      const amountRecord = rec(row.amount);
      const amount = Number(amountRecord.value ?? row.amount);
      const saleCurrency = String(row.currency ?? amountRecord.currency ?? currency);
      const rawDate = row.created_at ?? row.createdAt ?? row.occurred_at;
      const time = rawDate ? new Date(String(rawDate)).getTime() : 0;
      const group: SaleGroup = SUCCESS_STATUSES.includes(status) ? "success" : PENDING_STATUSES.includes(status) ? "pending" : "failed";
      const label = labels[status] ?? [status, status];
      return {
        key: String(row.id ?? `${status}-${index}`),
        group,
        label: en ? label[1] : label[0],
        product: String(row.product_name ?? rec(row.product).name ?? "—"),
        amount: Number.isFinite(amount) ? formatMoneyInUSD(amount, saleCurrency) ?? "—" : "—",
        date: time ? new Date(time).toLocaleDateString(en ? "en-GB" : "fr-FR") : "—",
        time,
      };
    });
    return rows.sort((a, b) => b.time - a.time);
  }, [data?.sales, currency, en]);

  const countBy = (group: SaleGroup) => saleRows.filter((row) => row.group === group).length;

  // Prochaine action : un seul conseil, le plus utile du moment.
  const nextAction = (() => {
    if (!products.length) return { title: tr("Ajoute ton premier produit", "Add your first product"), text: tr("Sans produit, Vendeo ne peut ni suivre ta boutique ni lancer de pub.", "Without a product, Vendeo can't track your store or launch ads."), cta: tr("Voir mes boutiques", "View my stores"), run: onGoToAds };
    if (problemCampaigns.length) return { title: tr("Corrige tes campagnes en erreur", "Fix your campaigns with errors"), text: tr(`${problemCampaigns.length} campagne(s) ont été refusées ou ont échoué.`, `${problemCampaigns.length} campaign(s) were rejected or failed.`), cta: tr("Voir mes campagnes", "View my campaigns"), run: onGoToAds };
    if (!campaigns.length) return { title: tr("Lance ta première pub", "Launch your first ad"), text: tr("Choisis un produit et un canal : Meta, TikTok ou Pinterest.", "Pick a product and a channel: Meta, TikTok or Pinterest."), cta: tr("Lancer une pub", "Launch an ad"), run: onLaunchAd };
    if (salesCount === 0) return { title: tr("Transforme tes visites en ventes", "Turn visits into sales"), text: tr("Aucune vente sur la période : demande à l'assistant d'analyser ta page de vente.", "No sales this period: ask the assistant to review your sales page."), cta: tr("Demander à l'assistant", "Ask the assistant"), run: onGoToAI };
    return { title: tr("Capitalise sur ce qui marche", "Build on what works"), text: tr("Demande à l'assistant quelle campagne mérite plus de budget.", "Ask the assistant which campaign deserves more budget."), cta: tr("Demander à l'assistant", "Ask the assistant"), run: onGoToAI };
  })();

  const trialLabel = subscription?.status === "active" && subscription?.trial_active === false ? null : subscription?.trial_active ? tr("Essai gratuit en cours", "Free trial in progress") : null;

  function productPrice(product: ProductData) {
    const value = Number(product.price);
    if (product.price === null || product.price === "" || !Number.isFinite(value)) return "—";
    return formatMoney(value, product.currency ?? currency);
  }

  const statusIcon = (group: SaleGroup) =>
    group === "success" ? <CheckCircle2 size={16} color="#065F46" /> : group === "pending" ? <Clock size={16} color="#92400E" /> : <XCircle size={16} color="#991B1B" />;

  return (
    <div className="dashboard-home" style={{ display: "grid", gap: 18 }}>
      {/* 1. Accueil + bilan */}
      <section className="app-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <span className="eyebrow">{tr("Vue d'ensemble", "Overview")}</span>
            <h1 style={{ margin: "4px 0 6px", fontSize: 24 }}>{tr(`Bonjour ${userFirstName} 👋`, `Hello ${userFirstName} 👋`)}</h1>
            <p className="hint-line" style={{ margin: 0 }}>
              {salesCount > 0
                ? tr(`Sur les ${periodDays} derniers jours : ${salesCount} vente${salesCount > 1 ? "s" : ""}, ${money(overview?.revenueNet)} de revenu net et ${activeCampaigns.length} campagne${activeCampaigns.length > 1 ? "s" : ""} en cours.`, `Over the last ${periodDays} days: ${salesCount} sale${salesCount > 1 ? "s" : ""}, ${money(overview?.revenueNet)} net revenue and ${activeCampaigns.length} running campaign${activeCampaigns.length > 1 ? "s" : ""}.`)
                : tr(`Pas encore de vente sur les ${periodDays} derniers jours. ${activeCampaigns.length ? `${activeCampaigns.length} campagne(s) en cours.` : "Lance une pub pour démarrer."}`, `No sales yet over the last ${periodDays} days. ${activeCampaigns.length ? `${activeCampaigns.length} running campaign(s).` : "Launch an ad to get started."}`)}
            </p>
            {trialLabel ? <p className="hint-line" style={{ margin: "6px 0 0" }}>{trialLabel}</p> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select aria-label={tr("Boutique", "Store")} value={selectedStoreId ?? ""} disabled={!stores.length} onChange={(event) => onStoreChange(event.target.value)}>
              {!stores.length && <option value="">{tr("Aucune boutique", "No store")}</option>}
              {stores.map((item) => <option key={item.id} value={item.id}>{item.store_name}</option>)}
            </select>
            <select aria-label={tr("Période", "Period")} value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
              <option value={7}>{tr("7 jours", "7 days")}</option>
              <option value={30}>{tr("30 jours", "30 days")}</option>
              <option value={90}>{tr("90 jours", "90 days")}</option>
            </select>
          </div>
        </div>

        <div style={{ ...gridStyle(150), marginTop: 16 }}>
          <div style={tileStyle}><span className="hint-line">{tr("Revenu net", "Net revenue")}</span><strong style={{ fontSize: 20 }}>{money(overview?.revenueNet)}</strong>{overview?.revenueChangePct !== null && overview?.revenueChangePct !== undefined ? <span className="hint-line">{overview.revenueChangePct >= 0 ? "+" : ""}{overview.revenueChangePct.toFixed(1)} %</span> : null}</div>
          <div style={tileStyle}><span className="hint-line">{tr("Ventes", "Sales")}</span><strong style={{ fontSize: 20 }}>{salesCount}</strong></div>
          <div style={tileStyle}><span className="hint-line">{tr("Panier moyen", "Average basket")}</span><strong style={{ fontSize: 20 }}>{money(overview?.averageBasket)}</strong></div>
          <div style={tileStyle}><span className="hint-line">{tr("Campagnes en cours", "Running campaigns")}</span><strong style={{ fontSize: 20 }}>{activeCampaigns.length}</strong></div>
        </div>
      </section>

      {/* 2. Campagnes, tous canaux */}
      <section className="app-card">
        <div className="card-head">
          <div><h2>{tr("Mes campagnes", "My campaigns")}</h2><p className="hint-line" style={{ margin: 0 }}>{tr("Meta, TikTok et Pinterest au même endroit.", "Meta, TikTok and Pinterest in one place.")}</p></div>
          <button type="button" className="btn btn-dark" onClick={onLaunchAd}><Plus size={14} /> {tr("Lancer une pub", "Launch an ad")}</button>
        </div>
        <div style={{ ...gridStyle(170), marginTop: 14 }}>
          {CHANNELS.map((channel) => {
            const mine = campaigns.filter((c) => c.platform === channel.id);
            const running = mine.filter((c) => c.status === "active" || c.status === "review").length;
            return (
              <div key={channel.id} style={{ ...tileStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ChannelBadge id={channel.badge} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{channel.label}</strong>
                  <span className="hint-line">{mine.length === 0 ? tr("Aucune campagne", "No campaign") : tr(`${running} en cours · ${mine.length} au total`, `${running} running · ${mine.length} total`)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AdCampaignsList key={campaignsVersion} storeId={storeId ?? null} plan={plan} onNewCampaign={onLaunchAd} />

      {/* 3. Dépenses pub par canal */}
      <AdSpendByChannel plan={plan} storeId={storeId ?? null} periodDays={periodDays} refreshKey={campaignsVersion} />

      {/* 4. Achats réussis / échoués */}
      <section className="app-card">
        <div className="card-head"><div><h2>{tr("Derniers achats", "Latest purchases")}</h2><p className="hint-line" style={{ margin: 0 }}>{tr("Paiements réussis, en attente ou échoués sur ta boutique.", "Successful, pending and failed payments on your store.")}</p></div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#D1FAE5", color: "#065F46" }}>{tr("Réussis", "Successful")} · {countBy("success")}</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>{tr("En attente", "Pending")} · {countBy("pending")}</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B" }}>{tr("Échoués / abandonnés", "Failed / abandoned")} · {countBy("failed")}</span>
        </div>
        {saleRows.length ? (
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {saleRows.slice(0, 8).map((row) => (
              <li key={row.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                {statusIcon(row.group)}
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{row.label}</strong>
                  <span className="hint-line" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.product} · {row.date}</span>
                </span>
                <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>{row.amount}</strong>
              </li>
            ))}
          </ul>
        ) : <p className="hint-line" style={{ marginTop: 12 }}>{tr("Aucun achat pour le moment. Ils apparaîtront ici dès la première vente.", "No purchases yet. They will show up here after the first sale.")}</p>}
      </section>

      {/* 5. Catalogue */}
      <section className="app-card">
        <div className="card-head"><div><h2>{tr("Mon catalogue", "My catalogue")}</h2><p className="hint-line" style={{ margin: 0 }}>{products.length ? tr(`${products.length} produit${products.length > 1 ? "s" : ""} dans ${store?.store_name ?? "ta boutique"}.`, `${products.length} product${products.length > 1 ? "s" : ""} in ${store?.store_name ?? "your store"}.`) : tr("Aucun produit trouvé dans ta boutique.", "No product found in your store.")}</p></div></div>
        {products.length ? (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {products.slice(0, 6).map((product) => (
              <div key={product.id} className="store-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="store-logo">{product.image ? <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Package size={18} />}</div>
                <div className="store-info" style={{ flex: 1, minWidth: 0 }}><strong>{product.name}</strong><span>{productPrice(product)}{product.sales ? ` · ${product.sales} ${tr("vente(s)", "sale(s)")}` : ""}</span></div>
                <button type="button" className="btn btn-ghost" onClick={onLaunchAd}><Megaphone size={14} /> {tr("Promouvoir", "Promote")}</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* 6. Prochaine action + alertes */}
      <section className="app-card">
        <div className="card-head"><div><span className="eyebrow">{tr("Prochaine action", "Next step")}</span><h2>{nextAction.title}</h2></div></div>
        <p className="hint-line" style={{ margin: "4px 0 12px" }}>{nextAction.text}</p>
        <button type="button" className="btn btn-dark" onClick={nextAction.run}>{nextAction.cta}</button>
        {alerts.length ? (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                <AlertTriangle size={15} color="#92400E" style={{ flexShrink: 0, marginTop: 2 }} />
                <div><strong style={{ fontSize: 13 }}>{alert.title}</strong><p className="hint-line" style={{ margin: 0 }}>{alert.description}</p></div>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onGoToAds}>{tr("Voir les performances détaillées (Pub)", "See detailed performance (Ads)")}</button>
      </section>
    </div>
  );
}
