"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Megaphone, Package, XCircle } from "lucide-react";
import { formatMoney, formatMoneyInUSD } from "@/lib/format";
import { getGreeting } from "@/lib/greetings";
import type { ReactNode } from "react";
import { DailyMotivationalQuote } from "./DailyMotivationalQuote";
import { useI18n } from "@/lib/i18n/i18n";
import type { PlanId } from "@/lib/plans";
import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";
import { AdSpendByChannel } from "./AdSpendByChannel";
import { Skeleton, SkeletonRows } from "./Skeleton";
import type { AnalyticsData, ProductData, StoreData, SubscriptionData } from "./shared";
import "@/app/dashboard-overview.css";
import { useNavigationData, useNavigationCache } from "./NavigationDataCache";

/**
 * Nouvelle "Vue d'ensemble" : simple, accueillante et multi-canaux.
 *
 * Elle remplace l'ancien écran centré sur Meta (MetaHistoryOverview / OverviewDetails),
 * dont le détail reste disponible dans l'onglet Pub. Elle répond à 4 questions :
 *  1. Où j'en suis ? (bilan de la période)
 *  2. Que font mes campagnes et combien coûtent-elles, tous canaux confondus ?
 *  3. Que vend ma boutique ? (catalogue)
 *  4. Que se passe-t-il côté achats ? (réussis / en attente / échoués)
 *
 * Tant qu'une donnée n'est pas arrivée, on affiche un skeleton à sa place (jamais de
 * « 0 », de « Aucune … » ou de texte provisoire qui change une fraction de seconde après).
 */

type CampaignSummary = { id: string; platform: string; status: string };
type SaleGroup = "success" | "pending" | "failed";
type SaleContact = { name: string | null; email: string | null; phone: string | null; country: string | null; failureReason: string | null };
type SaleRow = {
  key: string;
  status: string;
  group: SaleGroup;
  label: string;
  product: string;
  image: string | null;
  amount: string;
  date: string;
  clock: string;
  contact: SaleContact;
};
type PersistentAlert = { id: string; severity: string; title: string; description: string };

const SUCCESS_STATUSES = ["completed", "settled", "paid", "succeeded", "success"];
const PENDING_STATUSES = ["awaiting_payment", "pending", "processing"];

// Nombre de transactions Chariow affichées dans « Derniers achats ».
const LATEST_PURCHASES = 10;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function OverviewHome({
  stores,
  subscription,
  analytics,
  userFirstName,
  plan,
  selectedStoreId,
  onLaunchAd,
  onPromoteProduct,
  campaignsVersion,
  loading = false,
  onNavigate,
  storeSelector,
  selectedPeriodDays,
  onPeriodDaysChange,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string | null;
  plan: PlanId;
  selectedStoreId: string | null;
  onLaunchAd: () => void;
  /** Bouton « Promouvoir » d'un produit du catalogue : ouvre le lancement de pub avec ce produit déjà choisi.
   *  Sans cette fonction, on retombe sur le lancement classique (choix du produit à l'étape 1). */
  onPromoteProduct?: (product: ProductData) => void;
  campaignsVersion: number;
  /** Vrai tant que les données de la boutique et l'abonnement ne sont pas arrivés. */
  loading?: boolean;
  onNavigate?: (section: string) => void;
  storeSelector?: ReactNode;
  selectedPeriodDays?: number;
  onPeriodDaysChange?: (days: number) => void;
}) {
  const { locale , t } = useI18n();
  const en = locale === "en";
  const tr = (fr: string, english: string) => (en ? english : fr);

  const [localPeriodDays, setLocalPeriodDays] = useState(30);
  const periodDays = selectedPeriodDays ?? localPeriodDays;
  const setPeriodDays = onPeriodDaysChange ?? setLocalPeriodDays;
  const cache = useNavigationCache();
  const toDay = new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setDate(from.getDate() - periodDays + 1);
  const period = useNavigationData<{ snapshot: AnalyticsData }>(selectedStoreId ? `/api/analytics?store_id=${encodeURIComponent(selectedStoreId)}&from=${from.toISOString().slice(0, 10)}&to=${toDay}` : null);
  const campaignReading = useNavigationData<{ campaigns: CampaignSummary[] }>("/api/ad-campaigns", { version: campaignsVersion });
  const alertReading = useNavigationData<{ alerts: PersistentAlert[] }>("/api/alerts");
  const data = period.data?.snapshot ?? analytics;
  const campaigns = campaignReading.data?.campaigns ?? [];
  const campaignsReady = !campaignReading.loading;
  const periodLoading = period.loading && periodDays !== 30;
  const alerts = alertReading.data?.alerts ?? [];
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const saleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const saleCloseRef = useRef<HTMLButtonElement | null>(null);
  // Ce composant n'est monté qu'après le premier chargement (côté navigateur) : on lit donc
  // l'heure de l'appareil tout de suite, sans décalage serveur / navigateur ni salutation provisoire.
  const [now, setNow] = useState<Date>(() => new Date());

  const store = stores.find((item) => item.id === selectedStoreId) ?? stores[0];
  const storeId = store?.id ?? selectedStoreId;


  // Salutation : on met l'heure à jour toutes les 10 minutes (matin → après-midi → soirée).
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Garder le focus dans le flux du dialogue, fermer avec Échap et restaurer le déclencheur.
  useEffect(() => {
    if (!selectedSale) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    saleCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSale(null);
      if (event.key === "Tab") {
        event.preventDefault();
        saleCloseRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      saleTriggerRef.current?.focus();
    };
  }, [selectedSale]);

  const overview = data?.overview ?? null;
  const products: ProductData[] = data?.products ?? analytics?.products ?? [];
  const currency = overview?.currency ?? products[0]?.currency ?? "XOF";
  const salesCount = overview?.sales ?? data?.kpis.sales ?? 0;
  const money = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatMoneyInUSD(value, currency) ?? "—");

  const activeCampaigns = campaigns.filter((c) => c.status === "active" || c.status === "review");

  // Chiffres de la période : skeleton tant que les données ou les campagnes ne sont pas là.
  const statsLoading = loading || periodLoading;

  const greeting = userFirstName ? getGreeting(userFirstName, en ? "en" : "fr", now) : null;

  // Transactions Chariow : on part de la liste NON filtrée par période (le snapshot initial, sans dates),
  // puis on filtre nous-mêmes sur la période choisie (7 / 30 / 90 jours) ci-dessous. Ainsi la liste
  // reste fiable quel que soit ce que renvoie le snapshot filtré.
  const latestSales = analytics?.sales?.length ? analytics.sales : data?.sales ?? [];

  // Événements d'achat de la période choisie : réussis / en attente / échoués (10 plus récents, le plus récent en haut).
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
    // Début de la période : minuit (heure de l'appareil) il y a `periodDays - 1` jours, comme la plage envoyée à l'API.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays + 1);
    cutoff.setHours(0, 0, 0, 0);
    const cutoffTime = cutoff.getTime();
    // Visuel du produit : on le retrouve dans le catalogue par identifiant, sinon par nom.
    const imageById = new Map(products.map((item) => [String(item.id), item.image ?? null] as const));
    const imageByName = new Map(products.map((item) => [item.name, item.image ?? null] as const));
    const rows = latestSales.map((sale, index): SaleRow & { time: number } => {
      const row = rec(sale);
      const status = String(row.status ?? row.state ?? "unknown").toLowerCase();
      const amountRecord = rec(row.amount);
      const amount = Number(amountRecord.value ?? row.amount);
      const saleCurrency = String(row.currency ?? amountRecord.currency ?? currency);
      const rawDate = row.created_at ?? row.createdAt ?? row.occurred_at;
      const time = rawDate ? new Date(String(rawDate)).getTime() : 0;
      const group: SaleGroup = SUCCESS_STATUSES.includes(status) ? "success" : PENDING_STATUSES.includes(status) ? "pending" : "failed";
      const label = labels[status] ?? [status, status];
      const productName = String(row.product_name ?? rec(row.product).name ?? "—");
      const productId = row.product_id !== undefined && row.product_id !== null ? String(row.product_id) : null;
      const contactRecord = rec(row.contact);
      const failureReason = str(contactRecord.failureReason)
        ?? (status === "abandoned" ? (en ? "Purchase abandoned before payment was completed" : "Achat abandonné avant la fin du paiement") : null);
      return {
        key: String(row.id ?? `${status}-${index}`),
        status,
        group,
        label: en ? label[1] : label[0],
        product: productName,
        image: (productId ? imageById.get(productId) : null) ?? imageByName.get(productName) ?? null,
        amount: Number.isFinite(amount) ? formatMoneyInUSD(amount, saleCurrency) ?? "—" : "—",
        date: time ? new Date(time).toLocaleDateString(en ? "en-GB" : "fr-FR") : "—",
        clock: time ? new Date(time).toLocaleTimeString(en ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—",
        contact: {
          name: str(contactRecord.name),
          email: str(contactRecord.email),
          phone: str(contactRecord.phone),
          country: str(contactRecord.country),
          failureReason,
        },
        time,
      };
    });
    return rows
      .filter((row) => row.time >= cutoffTime)
      .sort((a, b) => b.time - a.time)
      .slice(0, LATEST_PURCHASES);
  }, [latestSales, products, currency, en, periodDays]);

  const countBy = (group: SaleGroup) => saleRows.filter((row) => row.group === group).length;

  const trialLabel = loading ? null : subscription?.status === "active" && subscription?.trial_active === false ? null : subscription?.trial_active ? tr(t("optionsExtra.text13"), "Free trial in progress") : null;

  function productPrice(product: ProductData) {
    const value = Number(product.price);
    if (product.price === null || product.price === "" || !Number.isFinite(value)) return "—";
    return formatMoney(value, product.currency ?? currency);
  }

  const statusIcon = (group: SaleGroup, size = 16) =>
    group === "success" ? <CheckCircle2 size={size} color="#065F46" /> : group === "pending" ? <Clock size={size} color="#92400E" /> : <XCircle size={size} color="#991B1B" />;

  return (
    <div className="dashboard-home" style={{ display: "grid", gap: 18 }}>
      {/* 1. Accueil + bilan */}
      <section className="app-card">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{tr(t("dashboard.overview"), "Overview")}</span>
          {greeting ? (
            <>
              <h1 style={{ margin: "4px 0 8px", fontSize: 24, fontWeight: 700 }}>{greeting}</h1>
              {/* Guillemets français « » (espaces insécables), “ ” en anglais. */}
              <DailyMotivationalQuote />
            </>
          ) : (
            <>
              <Skeleton width="55%" height={26} style={{ margin: "8px 0 10px" }} />
              <Skeleton width="70%" height={16} style={{ marginBottom: 10 }} />
            </>
          )}
          {trialLabel ? <p className="hint-line" style={{ margin: "6px 0 0" }}>{trialLabel}</p> : null}
        </div>

        <div className="ov-controls">
          {storeSelector}
          <label className="ov-period-filter"><span>{tr(t("overview.period"), "Period")}</span>
          <select className="ov-select" aria-label={tr(t("overview.period"), "Period")} value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
            <option value={7}>{tr(t("adminComplete.days7"), "7 days")}</option>
            <option value={30}>{tr(t("adminComplete.days30"), "30 days")}</option>
            <option value={90}>{tr(t("overview.last90"), "90 days")}</option>
          </select></label>
        </div>

        {/* Indicateurs clés de la boutique active */}
        <div className="ov-kpi-grid" aria-busy={statsLoading || !campaignsReady}>
          <div className="ov-kpi">
            <span className="hint-line">{tr(t("overview.netRevenue"), "Net revenue")}</span>
            {statsLoading ? <Skeleton width="50%" height={24} style={{ marginTop: 6 }} /> : <strong>{money(overview?.revenueNet)}</strong>}
            {!statsLoading && overview?.revenueChangePct !== null && overview?.revenueChangePct !== undefined ? <small className="hint-line">{overview.revenueChangePct >= 0 ? "+" : ""}{overview.revenueChangePct.toFixed(1)} %</small> : null}
          </div>
          <div className="ov-kpi">
            <span className="hint-line">{tr(t("dashboard.sales"), "Sales")}</span>
            {statsLoading ? <Skeleton width="30%" height={24} style={{ marginTop: 6 }} /> : <strong>{salesCount}</strong>}
          </div>
          <div className="ov-kpi">
            <span className="hint-line">{tr(t("overview.averageBasket"), "Average basket")}</span>
            {statsLoading ? <Skeleton width="40%" height={24} style={{ marginTop: 6 }} /> : <strong>{money(overview?.averageBasket)}</strong>}
          </div>
          <div className="ov-kpi">
            <span className="hint-line">{tr(t("optionsExtra.text14"), "Running campaigns")}</span>
            {!campaignsReady ? <Skeleton width="25%" height={24} style={{ marginTop: 6 }} /> : <strong>{activeCampaigns.length}</strong>}
          </div>
        </div>
      </section>

      {onNavigate ? <div className="overview-business-shortcuts" aria-label={t("sweep3.text143")}>
        <button type="button" onClick={() => onNavigate("Bénéfices nets")}><span className="overview-shortcut-icon"><Package size={20} /></span><span><strong>{t("sweep1.text144")}</strong><small>{t("sweep2.text145")}</small></span><span aria-hidden="true">↗</span></button>
        <button type="button" onClick={() => onNavigate("Relances WhatsApp")}><span className="overview-shortcut-icon recovery"><Clock size={20} /></span><span><strong>{t("sweep3.text146")}</strong><small>{t("sweep1.text147")}</small></span><span aria-hidden="true">↗</span></button>
      </div> : null}
      {/* 2. Liste des campagnes publicitaires */}
      <AdCampaignsList key={campaignsVersion} storeId={storeId ?? null} plan={plan} onNewCampaign={onLaunchAd} />

      {/* 3. Dépenses pub par canal */}
      <AdSpendByChannel plan={plan} storeId={storeId ?? null} periodDays={periodDays} refreshKey={campaignsVersion} />

      {/* 4. Derniers événements Chariow de la période (réussis / en attente / échoués) */}
      <section className="app-card">
        <div className="card-head"><div><h2>{tr(t("optionsExtra.text15"), "Latest purchases")}</h2><p className="hint-line" style={{ margin: 0 }}>{tr(t("dynamicExtra.latestEvents", { days: (periodDays) }), `The 10 latest events over the last ${periodDays} days on your Chariow store, most recent first. Click a row to see details.`)}</p></div></div>
        {loading ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Skeleton width={90} height={24} radius={999} />
              <Skeleton width={100} height={24} radius={999} />
              <Skeleton width={150} height={24} radius={999} />
            </div>
            <SkeletonRows count={4} label={tr(t("sweep2.text148"), "Loading purchases")} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#D1FAE5", color: "#065F46" }}>{tr(t("sweep3.text149"), "Successful")} · {countBy("success")}</span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>{tr(t("adminComplete.pending"), "Pending")} · {countBy("pending")}</span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B" }}>{tr(t("sweep1.text150"), "Failed / abandoned")} · {countBy("failed")}</span>
            </div>
            {saleRows.length ? (
              <ul className="ov-sales">
                {saleRows.map((row) => (
                  <li key={row.key}>
                    <button type="button" className="ov-sale" onClick={(event) => { saleTriggerRef.current = event.currentTarget; setSelectedSale(row); }} aria-haspopup="dialog">
                      <span className="ov-sale-thumb">
                        {row.image ? <img src={row.image} alt="" loading="lazy" /> : <Package size={18} />}
                        <span className="ov-sale-dot">{statusIcon(row.group, 14)}</span>
                      </span>
                      <span className="ov-sale-text">
                        <strong>{row.label}</strong>
                        <span className="hint-line">{row.product} · {row.date}</span>
                      </span>
                      <strong className="ov-sale-amount">{row.amount}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="hint-line" style={{ marginTop: 12 }}>{tr(t("dynamicExtra.noEvents", { days: (periodDays) }), `No event over the last ${periodDays} days.`)}</p>}
          </>
        )}
      </section>

      {/* 5. Catalogue */}
      <section className="app-card">
        <div className="card-head ov-catalogue-head"><div><h2>{tr(t("sweep2.text151"), "My catalogue")}</h2>{loading ? <Skeleton width={170} height={11} style={{ marginTop: 6 }} /> : <p className="hint-line" style={{ margin: 0 }}>{products.length ? tr(t("dynamicExtra.productCount", { count: (products.length), plural: (products.length > 1 ? "s" : ""), store: (store?.store_name ?? "ta boutique") }), `${products.length} product${products.length > 1 ? "s" : ""} in ${store?.store_name ?? "your store"}.`) : tr(t("sweep3.text152"), "No product found in your store.")}</p>}</div></div>
        {loading ? (
          <SkeletonRows count={3} thumb={44} label={tr(t("sweep1.text153"), "Loading catalogue")} />
        ) : products.length ? (
          <div className="ov-catalogue">
            {products.slice(0, 6).map((product) => (
              <div key={product.id} className="ov-product">
                <div className="ov-product-thumb">{product.image ? <img src={product.image} alt="" /> : <Package size={18} />}</div>
                <div className="ov-product-info"><strong>{product.name}</strong><span>{productPrice(product)}{product.sales ? ` · ${product.sales} ${tr(t("optionsExtra.text16"), "sale(s)")}` : ""}</span></div>
                <button type="button" className="btn btn-ghost ov-promote" onClick={() => (onPromoteProduct ? onPromoteProduct(product) : onLaunchAd())}><Megaphone size={14} /> {tr(t("finalExtra.text37"), "Promote")}</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Alertes importantes (affichées uniquement s'il y en a) */}
      {alerts.length ? (
        <section className="app-card">
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                <AlertTriangle size={15} color="#92400E" style={{ flexShrink: 0, marginTop: 2 }} />
                <div><strong style={{ fontSize: 13 }}>{alert.title}</strong><p className="hint-line" style={{ margin: 0 }}>{alert.description}</p></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Fenêtre de détail d'un événement Chariow : uniquement les infos utiles */}
      {selectedSale ? (
        <div className="sale-modal-backdrop" role="presentation" onClick={() => setSelectedSale(null)}>
          <section className="sale-modal sale-modal-wide" role="dialog" aria-modal="true" aria-labelledby="sale-modal-title" onClick={(event) => event.stopPropagation()}>
            <button ref={saleCloseRef} type="button" className="sale-modal-close" aria-label={tr(t("wizardExtra.close"), "Close")} onClick={() => setSelectedSale(null)}>×</button>
            <span className="eyebrow">{tr(t("sweep2.text154"), "Event details")}</span>
            <h2 id="sale-modal-title">{selectedSale.label}</h2>
            <div className="ov-modal-product">
              <span className="ov-sale-thumb">{selectedSale.image ? <img src={selectedSale.image} alt="" /> : <Package size={22} />}</span>
              <p>{selectedSale.product}</p>
            </div>

            <div className="sale-detail-grid">
              <div><small>{tr("Client", "Customer")}</small><strong>{selectedSale.contact.name ?? "—"}</strong></div>
              <div><small>{tr("E-mail", "Email")}</small><strong>{selectedSale.contact.email ?? "—"}</strong></div>
              <div><small>{tr(t("adminComplete.phone"), "Phone")}</small><strong>{selectedSale.contact.phone ?? "—"}</strong></div>
              <div><small>{tr(t("wizardExtra.location.country"), "Country")}</small><strong>{selectedSale.contact.country ?? "—"}</strong></div>
              {selectedSale.group === "failed" ? (
                <div><small>{tr(t("sweep3.text155"), "Failure reason")}</small><strong>{selectedSale.contact.failureReason ?? "—"}</strong></div>
              ) : null}
              <div><small>{tr("Date", "Date")}</small><strong>{selectedSale.date}</strong></div>
              <div><small>{tr(t("optionsExtra.text17"), "Time")}</small><strong>{selectedSale.clock}</strong></div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
