// Calculs d'unit economics du dashboard (fonctions pures, sans accès base).
// Règle commune : chaque fonction renvoie null quand la donnée ne permet pas de
// conclure. On n'invente jamais un chiffre et on n'affiche jamais un zéro trompeur.
// Les montants viennent de net_amount, qui contient déjà les frais Chariow : ne
// jamais les soustraire une seconde fois.

import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { convertCurrency } from "@/lib/currency";

/** Sous ce nombre de clients, la valeur client reçoit la pastille « Peu de données ». */
export const LOW_DATA_CUSTOMER_THRESHOLD = 30;

/** Marge cible par défaut (30 %), modifiable dans Paramètres. */
export const DEFAULT_TARGET_MARGIN = 0.3;

/** Part du plafond au-delà de laquelle la santé passe de « Sain » à « Limite ». */
export const HEALTH_LIMIT_RATIO = 0.8;

export type HealthLevel = "healthy" | "limit" | "critical";
export type OverviewState = "A" | "B" | "C" | "D";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Bénéfice = revenu net relié aux pubs - dépenses. Null sans dépenses (ce ne serait que du revenu). */
export function profit(netRevenue: number | null | undefined, spend: number | null | undefined): number | null {
  if (!isFiniteNumber(netRevenue) || !isFiniteNumber(spend) || spend <= 0) return null;
  return round(netRevenue - spend, 2);
}

/** Rentabilité en % = revenu net relié / dépenses x 100 (ex-ROAS x100). Null sans dépenses ou sans revenu relié. */
export function profitabilityPct(netRevenue: number | null | undefined, spend: number | null | undefined): number | null {
  if (!isFiniteNumber(netRevenue) || !isFiniteNumber(spend) || spend <= 0 || netRevenue < 0) return null;
  return round((netRevenue / spend) * 100, 1);
}

/** Coût par vente = dépenses / ventes reliées aux campagnes Vendeo (jamais toutes les ventes de la boutique). */
export function costPerSale(spend: number | null | undefined, linkedSales: number | null | undefined): number | null {
  if (!isFiniteNumber(spend) || !isFiniteNumber(linkedSales) || spend < 0 || linkedSales <= 0) return null;
  return round(spend / linkedSales, 2);
}

/** Plafond par client = revenu net moyen par client x (1 - marge cible). Marge attendue entre 0 inclus et 1 exclu. */
export function maxCostPerCustomer(avgNetPerCustomer: number | null | undefined, targetMargin: number = DEFAULT_TARGET_MARGIN): number | null {
  if (!isFiniteNumber(avgNetPerCustomer) || avgNetPerCustomer <= 0) return null;
  if (!isFiniteNumber(targetMargin) || targetMargin < 0 || targetMargin >= 1) return null;
  return round(avgNetPerCustomer * (1 - targetMargin), 2);
}

/** Valeur client = revenu net cumulé par client / clients distincts. Reçoit un revenu net cumulé par client. */
export function customerValue(netByCustomer: readonly (number | null)[]): number | null {
  if (!netByCustomer.length || netByCustomer.some((value) => !isFiniteNumber(value))) return null;
  const values = netByCustomer as readonly number[];
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

/** Vrai si l'échantillon est trop petit pour que la valeur client soit fiable. */
export function isLowData(customerCount: number, threshold: number = LOW_DATA_CUSTOMER_THRESHOLD): boolean {
  return !isFiniteNumber(customerCount) || customerCount < threshold;
}

/** Taux de rachat = clients avec au moins 2 commandes / clients distincts (0 à 1). */
export function repeatRate(ordersByCustomer: readonly number[]): number | null {
  const orders = ordersByCustomer.filter(isFiniteNumber);
  if (!orders.length) return null;
  return orders.filter((count) => count >= 2).length / orders.length;
}

/** Taux d'abandon = abandonnés / (confirmées + abandonnées + échouées). Même définition que profitability-aggregates. */
export function abandonmentRate(input: { completed: number; abandoned: number; failed?: number }): number | null {
  const attempts = input.completed + input.abandoned + (input.failed ?? 0);
  if (!isFiniteNumber(attempts) || attempts <= 0) return null;
  return input.abandoned / attempts;
}

/**
 * Santé : coût par client face au plafond.
 * <= 80 % du plafond : Sain ; jusqu'à 100 % : Limite ; au-delà : Critique.
 */
export function health(costPerCustomer: number | null | undefined, maxCost: number | null | undefined): HealthLevel | null {
  if (!isFiniteNumber(costPerCustomer) || !isFiniteNumber(maxCost) || costPerCustomer < 0 || maxCost <= 0) return null;
  const ratio = costPerCustomer / maxCost;
  if (ratio <= HEALTH_LIMIT_RATIO) return "healthy";
  if (ratio <= 1) return "limit";
  return "critical";
}

/**
 * Récupération en jours : premier jour où le revenu net cumulé relié couvre les dépenses.
 * Null s'il n'y a ni dépenses ni ventes reliées, ou si les dépenses ne sont pas encore couvertes.
 */
export function paybackDays(input: { spend: number | null | undefined; linkedSales: ReadonlyArray<{ daysSinceLaunch: number; netRevenue: number }> }): number | null {
  const { spend, linkedSales } = input;
  if (!isFiniteNumber(spend) || spend <= 0 || !linkedSales.length) return null;
  const sorted = [...linkedSales].filter((sale) => isFiniteNumber(sale.daysSinceLaunch) && isFiniteNumber(sale.netRevenue)).sort((a, b) => a.daysSinceLaunch - b.daysSinceLaunch);
  let cumulative = 0;
  for (const sale of sorted) {
    cumulative += sale.netRevenue;
    if (cumulative >= spend) return Math.max(0, Math.ceil(sale.daysSinceLaunch));
  }
  return null;
}

/**
 * État de l'écran Mes pubs :
 * A = ventes, aucune pub Vendeo ; B = pub lancée, aucune vente reliée ;
 * C = pub + ventes reliées ; D = aucune vente et aucune pub.
 */
export function overviewState(input: { confirmedSales: number; vendeoCampaigns: number; linkedSales: number }): OverviewState {
  if (input.vendeoCampaigns > 0) return input.linkedSales > 0 ? "C" : "B";
  return input.confirmedSales > 0 ? "A" : "D";
}

export type CustomerSale = {
  store_id?: string | null;
  /** Colonne générée chariow_sales.customer_id (raw_payload.customer.id). Jamais d'email ni de téléphone. */
  customer_id?: string | null;
  status?: string | null;
  net_amount?: number | string | null;
  currency?: string | null;
};

export type CustomerStats = {
  customers: number;
  netByCustomer: Array<number | null>;
  ordersByCustomer: number[];
  /** Ventes confirmées ignorées : devise absente ou non convertible. */
  skippedSales: number;
  /** Ventes confirmées sans customer_id. */
  withoutCustomer: number;
  currency: string;
};

/**
 * Regroupe les ventes confirmées par client (par boutique) dans une devise cible.
 * Une vente dont la devise ne peut pas être convertie est ignorée et comptée, jamais devinée.
 */
export function aggregateCustomers(sales: readonly CustomerSale[], targetCurrency: string): CustomerStats {
  const target = targetCurrency.trim().toUpperCase();
  const byCustomer = new Map<string, { net: number | null; orders: number }>();
  let skippedSales = 0;
  let withoutCustomer = 0;
  for (const sale of sales) {
    const refunded = /refund|chargeback/i.test(sale.status ?? "");
    if (!isConfirmedChariowSaleStatus(sale.status) && !refunded) continue;
    const customerId = typeof sale.customer_id === "string" ? sale.customer_id.trim() : "";
    if (!customerId) {
      if (refunded) skippedSales += 1; else withoutCustomer += 1;
      continue;
    }
    const currency = typeof sale.currency === "string" ? sale.currency.trim().toUpperCase() : "";
    const amount = sale.net_amount == null || sale.net_amount === "" ? NaN : Number(sale.net_amount);
    const converted = currency && Number.isFinite(amount) ? (currency === target ? amount : convertCurrency(amount, currency, target)) : null;
    if (converted === null) { skippedSales += 1; continue; }
    const key = `${sale.store_id ?? ""}:${customerId}`;
    const entry = byCustomer.get(key) ?? { net: 0, orders: 0 };
    if (converted === null) entry.net = null; else if (entry.net !== null) entry.net += refunded ? -Math.abs(converted) : converted;
    if (!refunded) entry.orders += 1;
    byCustomer.set(key, entry);
  }
  const entries = [...byCustomer.values()];
  return {
    customers: entries.length,
    netByCustomer: [...entries.map((entry) => entry.net === null ? null : round(entry.net, 2)), ...((skippedSales || withoutCustomer) ? [null] : [])],
    ordersByCustomer: entries.map((entry) => entry.orders),
    skippedSales,
    withoutCustomer,
    currency: target,
  };
}
