import type { Locale } from "./locales";

/** Copy for public-facing interfaces not covered by the main product dictionaries. */
export const publicCopy: Record<Locale, Record<string, string>> = {
  fr: {
    "publicExtra.shop.preview": "Aperçu privé : cette vitrine n’est pas encore publiée.",
    "publicExtra.shop.unavailable": "Les produits sont momentanément indisponibles. Réessaie dans un instant.",
    "publicExtra.shop.empty": "Aucun produit à afficher pour le moment.",
    "publicExtra.shop.products": "Produits",
    "publicExtra.shop.allProducts": "Tous les produits",
  },
  en: {
    "publicExtra.shop.preview": "Private preview: this storefront has not been published yet.",
    "publicExtra.shop.unavailable": "Products are temporarily unavailable. Please try again shortly.",
    "publicExtra.shop.empty": "There are no products to display right now.",
    "publicExtra.shop.products": "Products",
    "publicExtra.shop.allProducts": "All products",
  },
};
