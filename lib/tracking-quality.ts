export type TrackingIssue = { code: string; message: string };
export type TrackingQuality = {
  status: "incomplete" | "verified";
  checkedAt: string;
  paidSales: number | null;
  issues: TrackingIssue[];
  automaticActionsAllowed: false;
};
export function assessTrackingQuality(input: {
  checkedAt: string;
  salesComplete: boolean | null;
  salesSyncedAt: string | null;
  salesError?: boolean;
  paidSales: number | null;
  missingProducts: number | null;
  missingAmounts: number | null;
  unattributedSales: number | null;
  linkedAccounts: number | null;
  pixelConfigured: boolean | null;
  pixelLastFiredAt: string | null;
  pixelLookupSkipped?: boolean;
}): TrackingQuality {
  const issues: TrackingIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.salesError) add("sales_unavailable", "Les ventes n’ont pas pu être vérifiées. Les chiffres peuvent être incomplets.");
  if (input.salesComplete !== true) add("coverage_unknown", "La couverture complète des ventes Chariow n’est pas confirmée.");
  const age = input.salesSyncedAt ? Date.parse(input.checkedAt) - Date.parse(input.salesSyncedAt) : NaN;
  if (!Number.isFinite(age) || age < 0 || age > 48 * 3600000) add("sales_stale", "Une synchronisation complète récente des ventes est nécessaire.");
  if (input.missingProducts === null) add("products_unknown", "Le lien vente → produit n’a pas pu être vérifié.");
  else if (input.missingProducts > 0) add("products_missing", `${input.missingProducts} vente(s) payée(s) sans produit identifié.`);
  if (input.missingAmounts === null) add("amounts_unknown", "Les montants et devises des ventes ne sont pas vérifiés.");
  else if (input.missingAmounts > 0) add("amounts_missing", `${input.missingAmounts} vente(s) payée(s) avec montant ou devise inconnu.`);
  if (input.linkedAccounts === null) add("accounts_unknown", "Les comptes publicitaires n’ont pas pu être vérifiés.");
  else if (input.linkedAccounts === 0) add("account_unlinked", "L’association d’un compte Meta à cette boutique n’est pas identifiée dans Vendeo.");
  if (input.unattributedSales === null) add("attribution_unknown", "L’attribution vente → campagne n’a pas pu être vérifiée.");
  else if (input.unattributedSales > 0) add("attribution_missing", `${input.unattributedSales} vente(s) payée(s) sans campagne publicitaire attribuée. Ces ventes peuvent être organiques ; ne pas leur attribuer de campagne sans preuve fiable.`);
  if (!input.pixelLookupSkipped && input.pixelConfigured === null) add("pixel_unknown", "L’installation du pixel Chariow n’a pas pu être vérifiée.");
  if (!input.pixelLookupSkipped && input.pixelConfigured === false) add("pixel_unknown", "Aucun pixel n’est déclaré comme installé sur Chariow pour ce compte.");
  const pixelAge = input.pixelLastFiredAt ? Date.parse(input.checkedAt) - Date.parse(input.pixelLastFiredAt) : NaN;
  if (!input.pixelLookupSkipped && input.pixelConfigured === true && (!Number.isFinite(pixelAge) || pixelAge < 0 || pixelAge > 48 * 3600000)) add("pixel_events_unknown", "Les événements d’achat ne sont pas vérifiables dans Vendeo ; cela ne remet pas en cause l’installation déclarée du pixel.");
  if (input.paidSales === 0) add("no_paid_sales", "Aucune vente payée dans cette période : le suivi d’un achat réel reste à valider.");
  // Financial limits and conversion-event validation are separate server-side
  // requirements. A clean diagnostic must never itself enable automation.
  return { status: issues.length ? "incomplete" : "verified", checkedAt: input.checkedAt, paidSales: input.paidSales, issues, automaticActionsAllowed: false };
}
