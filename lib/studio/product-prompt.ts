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

// Consigne anti-narration : sans elle, le modèle vidéo (qui génère aussi la
// voix) n'a rien d'autre à "lire" que la description de scène, et finit par la
// réciter telle quelle en voix off ("vidéo UGC montrant..."). On la répète en
// toute fin de prompt — la position la plus lue par la plupart des modèles
// vidéo — et jamais entre guillemets, pour qu'elle ne soit pas elle-même prise
// pour du dialogue.
const NO_NARRATION_RULE =
  "Règle audio impérative : le seul son parlé est la voix de la personne filmée qui s'exprime naturellement, dans ses propres mots, dans la langue du brief. Elle n'improvise jamais en citant ou paraphrasant ces instructions de mise en scène, ne dit jamais des phrases comme « vidéo montrant » ou « publicité UGC », et il n'y a aucune voix off qui décrit ou résume la scène de l'extérieur.";

export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false) {
  const brief = userPrompt.trim();
  if (kind === "video" && !product) {
    return [
      "Plan-séquence filmé au smartphone, style UGC : une personne (créatrice ou cliente) se trouve dans un décor quotidien et s'adresse directement à la caméra, avec le naturel d'une story Instagram.",
      `Ce qu'elle raconte, dans ses propres mots : elle parle librement pour promouvoir ceci — ${brief || "l'offre, avec un bénéfice concret et un appel à l'action clair"} — sans jamais lire ni paraphraser la consigne elle-même.`,
      "Mise en scène (ne décrit pas ce qui est dit, seulement ce qui est filmé) : accroche visuelle dans les toutes premières secondes, scène humaine crédible, démonstration ou usage réel du produit ou de l'offre, geste ou réaction qui montre le bénéfice, puis un signe clair d'appel à l'action (regard caméra, pointage, produit levé...).",
      "Réalisation : scènes vivantes et distinctes mais cohérentes entre elles, gestes et expressions naturels, cadrage smartphone vertical si le format est vertical, lumière quotidienne, caméra légèrement imparfaite mais stable, transitions simples. Continuité du visage, des vêtements, du produit et du décor d'un plan à l'autre. Pas de mains ou visages déformés, pas de changement d'identité, pas de plan abstrait, pas de texte incrusté illisible.",
      NO_NARRATION_RULE,
    ].join(" ").slice(0, 4000);
  }
  if (!product) return brief;
  const priceLine = product.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
  const defaultBrief = kind === "image" ? "visuel promotionnel soigné mettant le produit en valeur" : "vidéo promotionnelle soignée mettant le produit en valeur";
  if (kind === "image") {
    return [
      "Crée un visuel professionnel pour ce produit numérique de la boutique.",
      `Produit : « ${product.name} ».`, product.description ? `Description : ${product.description}` : "", priceLine,
      `Demande de l'utilisateur : ${brief || defaultBrief}.`,
      hasReference ? "Image de référence : c'est la couverture du produit ; conserve fidèlement son apparence (forme, couleurs, titre) et ne la déforme pas." : "",
      "Consignes : composition professionnelle, produit bien mis en valeur, aucun texte flou ni faute d'orthographe, n'invente ni prix, ni logo, ni promesse absents des informations ci-dessus.",
    ].filter(Boolean).join(" ").slice(0, 4000);
  }
  return [
    "Plan-séquence filmé au smartphone, style UGC : une personne (créatrice ou cliente) se trouve dans un décor quotidien et présente ce produit numérique à la caméra, avec le naturel d'une story Instagram.",
    `Produit présenté : « ${product.name} ».`, product.description ? `Description du produit : ${product.description}` : "", priceLine,
    `Ce qu'elle raconte, dans ses propres mots : elle parle librement pour promouvoir ce produit selon cette demande — ${brief || defaultBrief} — sans jamais lire ni paraphraser la consigne elle-même.`,
    hasReference ? "Image de référence : c'est la couverture du produit ; conserve fidèlement son apparence (forme, couleurs, titre) et ne la déforme pas." : "",
    "Mise en scène (ne décrit pas ce qui est dit, seulement ce qui est filmé) : accroche visuelle immédiate, démonstration ou usage réel du produit, geste ou réaction qui montre le bénéfice concret, puis un signe clair d'appel à l'action.",
    "Réalisation : scènes distinctes mais cohérentes, gestes et expressions réalistes, caméra smartphone naturelle, lumière quotidienne, mouvements fluides. Même visage, mêmes vêtements, même produit et continuité du décor entre les plans. Pas de mains ou visages déformés, pas de changement d'identité, pas de texte incrusté illisible. N'invente ni prix, ni logo, ni caractéristique, ni promesse absents des informations ci-dessus.",
    NO_NARRATION_RULE,
  ].filter(Boolean).join(" ").slice(0, 4000);
}
