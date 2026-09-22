export type StudioProductInput = {
  id?: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  imageUrl?: string | null;
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseStudioProduct(raw: unknown): StudioProductInput | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const name = clean(source.name, 200);
  if (!name) return null;
  const price = typeof source.price === "number" || typeof source.price === "string" ? String(source.price).slice(0, 40) : "";
  let imageUrl: string | null = null;
  if (typeof source.imageUrl === "string") {
    try {
      const url = new URL(source.imageUrl);
      if (url.protocol === "https:" && /(^|\.)chariow\.com$/i.test(url.hostname)) imageUrl = url.toString();
    } catch {}
  }
  return { id: clean(source.id, 80) || undefined, name, description: clean(source.description, 1200) || undefined, price: price || undefined, currency: clean(source.currency, 8) || undefined, imageUrl };
}

// Plusieurs tentatives précédentes ajoutaient au prompt vidéo tout un
// scénario imposé : structure en plans (accroche/problème/révélation/
// bénéfice/CTA), consignes de style, interdiction stricte de parole et de
// texte à l'écran, exigence de fidélité exacte à la couverture produit...
// Résultat en usage réel : voix étrange ou inintelligible malgré
// l'interdiction, texte à l'écran malgré l'interdiction, couverture du
// produit non fidèle malgré la consigne — le modèle vidéo d'Imole ne suit pas
// ces contraintes de façon fiable, quel que soit le degré de détail du
// prompt. On est donc revenu à un prompt minimal (produit + description de
// l'utilisateur, sans mise en scène imposée) : c'est Imole qui décide
// entièrement de la réalisation, comme avant l'introduction de ce scénario.
export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false) {
  const brief = userPrompt.trim();
  if (kind === "video") {
    if (!product) return brief || "Vidéo promotionnelle soignée.";
    const priceLine = product.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
    return [
      `Produit : « ${product.name} ».`,
      product.description ? `Description : ${product.description}` : "",
      priceLine,
      `Demande : ${brief || "vidéo promotionnelle soignée mettant le produit en valeur."}`,
    ].filter(Boolean).join(" ").slice(0, 4000);
  }
  if (!product) return brief;
  const priceLine = product.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
  const defaultBrief = "visuel promotionnel soigné mettant le produit en valeur";
  return [
    "Crée un visuel professionnel pour ce produit numérique de la boutique.",
    `Produit : « ${product.name} ».`, product.description ? `Description : ${product.description}` : "", priceLine,
    `Demande de l'utilisateur : ${brief || defaultBrief}.`,
    hasReference ? "Image de référence : c'est la couverture du produit ; conserve fidèlement son apparence (forme, couleurs, titre) et ne la déforme pas." : "",
    "Consignes : composition professionnelle, produit bien mis en valeur, aucun texte flou ni faute d'orthographe, n'invente ni prix, ni logo, ni promesse absents des informations ci-dessus.",
  ].filter(Boolean).join(" ").slice(0, 4000);
}
