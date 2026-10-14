// Boutons d'appel à l'action (call_to_action.type) proposés pour les publicités Meta.
// Liste volontairement courte : uniquement des types compatibles avec un lien vers une
// boutique (pas de WhatsApp/Messenger, qui demandent une configuration de destination différente).

export const META_CTA_TYPES = ["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "ORDER_NOW", "GET_OFFER", "CONTACT_US"] as const;

export type MetaCtaType = (typeof META_CTA_TYPES)[number];

/** Bouton proposé par défaut aux nouvelles campagnes (l'ancien comportement était LEARN_MORE). */
export const DEFAULT_META_CTA: MetaCtaType = "SHOP_NOW";

/** Bouton utilisé quand une campagne existante n'a aucun CTA enregistré (comportement historique). */
export const LEGACY_META_CTA: MetaCtaType = "LEARN_MORE";

export function normalizeMetaCta(value: unknown): MetaCtaType | null {
  return typeof value === "string" && (META_CTA_TYPES as readonly string[]).includes(value) ? (value as MetaCtaType) : null;
}

export const META_CTA_LABELS: Record<MetaCtaType, { fr: string; en: string }> = {
  SHOP_NOW: { fr: "Acheter", en: "Shop now" },
  LEARN_MORE: { fr: "En savoir plus", en: "Learn more" },
  BUY_NOW: { fr: "Acheter maintenant", en: "Buy now" },
  ORDER_NOW: { fr: "Commander", en: "Order now" },
  GET_OFFER: { fr: "Obtenir l'offre", en: "Get offer" },
  CONTACT_US: { fr: "Nous contacter", en: "Contact us" },
};
