// components/vendeo/types.ts
// Types partagés par les composants de la refonte du Dashboard Vendeo.

export type Verdict = "stop" | "scale" | "stable";

export type ConnectionStatus = "connected" | "invalid" | "not_configured";

export interface ConnectionPillState {
  chariow: ConnectionStatus;
  meta: ConnectionStatus;
  tiktok: ConnectionStatus;
}

export type PeriodFilter = "today" | "7d" | "30d";

export interface VerdictBannerData {
  verdict: Verdict;
  // Variante STOP
  campaignName?: string;
  spend?: number;
  // Variante SCALE
  bestCampaignName?: string;
  roas?: number;
  suggestedBudgetIncrease?: number;
  estimatedExtraSales?: number;
  // Variante STABLE
  activeCampaignsCount?: number;
}

export interface ImpactFinancierData {
  budgetEconomise: number; // gaspillage évité
  revenuAdditionnelEstime: number; // gains potentiels
}

export type CampaignVerdictBadge = "stop" | "scale" | "test";

export interface CampaignRow {
  id: string;
  campaignName: string;
  productName: string;
  audienceTags: string[]; // ex: ["18-35 ans", "Cotonou", "Mode"]
  network: "meta" | "tiktok";
  spend: number;
  realSales: number; // nombre de ventes payées
  realRevenue: number; // chiffre d'affaires réel encaissé
  verdict: CampaignVerdictBadge;
  recommendedAction: string; // ex: "Couper la pub", "Budget +5$"
}

export type DiagnosticType = "price_up" | "checkout_alert" | "audience" | "info";

export interface DiagnosticCard {
  id: string;
  type: DiagnosticType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Formatte un montant publicitaire (dépense, budget) en dollars US, la devise
// du compte publicitaire Meta connecté — ex: 15 000 → "15 000,00 $". Le nom
// de la fonction garde "XOF" pour ne pas casser tous les imports existants,
// mais elle affiche désormais du $ (voir conversation du 27/09/2026 : Meta
// facturait en $ alors que Vendeo affichait du XOF, un montant de campagne
// XOF saisi par l'utilisateur était donc interprété comme des $ par Meta).
export function formatXOF(value: number): string {
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
