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

export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false) {
  const brief = userPrompt.trim();
  if (kind === "video" && !product) {
    return [
      "Crée une vidéo publicitaire UGC authentique et naturelle, pensée pour promouvoir une offre ou un produit.",
      "La demande de l'utilisateur est prioritaire : respecte son produit, son angle, son ton, sa cible et ses contraintes.",
      `Brief utilisateur : ${brief || "présente clairement l'offre avec un bénéfice concret et un appel à l'action."}`,
      "Structure la vidéo comme un mini-scénario cohérent adapté à la durée : accroche immédiate dans les premières secondes, scène humaine crédible avec un créateur ou client qui parle naturellement à la caméra, démonstration ou usage réel, preuve ou bénéfice concret, puis appel à l'action clair.",
      "Utilise des scènes vivantes et distinctes, des gestes humains réalistes, des expressions naturelles, un cadrage smartphone vertical si le format est vertical, une lumière quotidienne, une caméra légèrement imparfaite mais stable, et des transitions simples. Maintiens la même personne, le même produit, les mêmes vêtements et le même décor lorsque la continuité l'exige.",
      "Le dialogue doit être court, oral, crédible et adapté à la langue du brief. Évite les monologues trop rapides, les scènes abstraites, les changements de visage, les mains déformées, les mouvements impossibles et les plans sans rapport avec le produit. N'invente ni prix, ni logo, ni caractéristique, ni promesse absents du brief.",
      "Si aucun texte ou dialogue n'est demandé, privilégie une narration visuelle claire et des réactions humaines plutôt que du texte incrusté illisible.",
    ].join(" ").slice(0, 4000);
  }
  if (!product) return brief;
  const priceLine = product.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
  const defaultBrief = kind === "image" ? "visuel promotionnel soigné mettant le produit en valeur" : "vidéo promotionnelle soignée mettant le produit en valeur";
  return [
    kind === "image" ? "Crée un visuel professionnel pour ce produit numérique de la boutique." : "Crée une courte vidéo promotionnelle professionnelle pour ce produit numérique de la boutique.",
    `Produit : « ${product.name} ».`, product.description ? `Description : ${product.description}` : "", priceLine,
    `Demande de l'utilisateur : ${brief || defaultBrief}.`,
    hasReference ? "Image de référence : c'est la couverture du produit ; conserve fidèlement son apparence (forme, couleurs, titre) et ne la déforme pas." : "",
    kind === "image" ? "Consignes : composition professionnelle, produit bien mis en valeur, aucun texte flou ni faute d'orthographe, n'invente ni prix, ni logo, ni promesse absents des informations ci-dessus." : "Consignes : crée une publicité UGC structurée comme un mini-scénario adapté à la durée : accroche immédiate, scène humaine avec un créateur ou client qui présente naturellement le produit, démonstration ou usage réel, bénéfice concret, puis appel à l'action. Respecte la demande de l'utilisateur comme priorité pour l'angle, le ton, la cible et le message. Utilise des scènes distinctes mais cohérentes, des gestes et expressions réalistes, une caméra smartphone naturelle, une lumière quotidienne et des mouvements fluides. Garde le même visage, les mêmes vêtements, le même produit et la continuité du décor entre les plans. Le dialogue doit être court, oral et crédible dans la langue du brief. Évite les mains ou visages déformés, les changements d'identité, les plans abstraits, les transitions excessives et le texte incrusté illisible. N'invente ni prix, ni logo, ni caractéristique, ni promesse absents des informations ci-dessus.",
  ].filter(Boolean).join(" ").slice(0, 4000);
}
