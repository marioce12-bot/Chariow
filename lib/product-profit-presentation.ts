/** Display-only explanations. Never forward server diagnostics or identifiers into the UI. */
type ProfitDisplayInput = {
  currency: string; netRevenue: number | null;
  adSpendStatus?: string; adSpendReasons?: string[]; linkedCampaignCount?: number;
  adSpendByCurrency?: Array<{ currency: string; amount: number | null }>;
  advertising?: {
    status?: string; adSpendStatus?: string; reason?: string; adSpendReasons?: string[];
    linkedCampaigns?: number; linkedCampaignCount?: number;
    spendByCurrency?: Array<{ currency: string; amount: number | null }>;
    adSpendByCurrency?: Array<{ currency: string; amount: number | null }>;
  };
};
export function profitDisplayReasons(p: ProfitDisplayInput, en: boolean): string[] {
  const ad = p.advertising;
  const reasons = ad?.reason ? [ad.reason] : ad?.adSpendReasons ?? p.adSpendReasons ?? [];
  const diagnostic = reasons.join(" ").toLowerCase();
  const status = ad?.status ?? ad?.adSpendStatus ?? p.adSpendStatus;
  const currencies = ad?.spendByCurrency ?? ad?.adSpendByCurrency ?? p.adSpendByCurrency ?? [];
  const linked = ad?.linkedCampaigns ?? ad?.linkedCampaignCount ?? p.linkedCampaignCount;
  const result: string[] = [];
  if (p.netRevenue == null || diagnostic.includes("ventes incomplètes")) result.push(en ? "Sales data is incomplete for this period." : "Données de ventes incomplètes sur cette période.");
  if (/quotidien|synchronisation|couverture|données publicitaires indisponibles|dépenses meta incomplètes/.test(diagnostic)) result.push(en ? "Meta spend is incomplete for this period." : "Dépenses Meta incomplètes sur cette période.");
  if (/devises|devise produit/.test(diagnostic) || currencies.some(x => x.currency.toUpperCase() !== p.currency.toUpperCase())) result.push(en ? "Currencies cannot be compared reliably for this period." : "Devises non comparables sur cette période.");
  if (status === "ambiguous" || /multi-produit|attribution ambiguë/.test(diagnostic)) result.push(en ? "Campaign spend shared across products cannot be allocated reliably." : "Dépenses partagées entre plusieurs produits : répartition non déterminée.");
  if (/compte meta absent ou ambigu/.test(diagnostic)) result.push(en ? "The campaign’s Meta account could not be verified." : "Le compte Meta de la campagne n’a pas pu être vérifié.");
  if (linked === 0 || /aucune campagne explicitement rattachée au produit/.test(diagnostic)) result.push(en ? "No advertising campaign is explicitly linked to this product." : "Aucune campagne publicitaire explicitement associée à ce produit.");
  return result.length ? result : [en ? "The data needed to estimate profit reliably is incomplete." : "Données nécessaires au calcul d’un bénéfice fiable incomplètes."];
}

/** Names may be absent; never use internal IDs as customer-facing fallback labels. */
export function profitDisplayName(name: string | null | undefined, fallback: string): string {
  if (!name?.trim()) return fallback;
  return name.replace(/\b\d{10,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "").trim() || fallback;
}
