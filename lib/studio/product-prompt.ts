export type StudioProductInput = {
  id?: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  imageUrl?: string | null;
};

export type StudioVideoOptions = {
  theme?: string;
  ambiance?: string;
  characterType?: string;
  videoType?: string;
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
  // La description Chariow d'une fiche produit détaillée peut largement dépasser
  // quelques centaines de caractères. Un plafond trop bas la coupait en plein
  // milieu et donnait un prompt incomplet côté génération d'image/vidéo — on
  // garde une limite large plutôt que de la retirer complètement, pour éviter
  // un prompt démesuré si une description est anormalement longue.
  return { id: clean(source.id, 80) || undefined, name, description: clean(source.description, 4000) || undefined, price: price || undefined, currency: clean(source.currency, 8) || undefined, imageUrl };
}

// Plusieurs tentatives précédentes ajoutaient au prompt vidéo tout un
// scénario imposé : structure en plans (accroche/problème/révélation/
// bénéfice/CTA), consignes de style, interdiction stricte de parole et de
// texte à l'écran, exigence de fidélité exacte à la couverture produit...
// Résultat en usage réel : voix étrange ou inintelligible malgré
// l'interdiction, texte à l'écran malgré l'interdiction, couverture du
// produit non fidèle malgré la consigne — le modèle vidéo d'Imole ne suit pas
// ces contraintes de façon fiable, quel que soit le degré de détail du
// prompt. On reste donc minimal : pas de scénario en plans imposé, pas de
// mise en scène détaillée. On corrige uniquement deux défauts précis et
// récurrents remontés par les utilisateurs — une voix off qui récite la
// fiche produit au lieu de jouer la scène ("vidéo présentant..."), et une fin
// de vidéo qui coupe en plein mouvement au lieu de refermer la scène — avec
// deux phrases courtes plutôt qu'un cahier des charges complet. Les options
// (thème, ambiance, personnage, type de vidéo) restent elles aussi de simples
// bouts de phrase optionnels, jamais une mise en scène imposée en plans.
export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false, videoOptions: StudioVideoOptions = {}) {
  const brief = userPrompt.trim();
  if (kind === "video") {
    const parts: string[] = [];
    if (product) {
      // Formulé comme une scène filmée, pas comme une fiche produit récitable :
      // "Produit : X. Description : Y." ressemble à un texte qu'on peut lire à
      // voix haute tel quel, ce que le modèle fait littéralement dans certains cas.
      parts.push(`Scène filmée montrant le produit « ${product.name} » utilisé ou présenté naturellement à l'écran, sans jamais énoncer ces informations telles quelles à l'oral.`);
      if (product.description) parts.push(`Éléments de contexte pour la mise en scène (à ne pas réciter) : ${product.description}`);
      if (product.price) parts.push(`Prix (à ne mentionner que si un personnage en parle naturellement) : ${product.price}${product.currency ? ` ${product.currency}` : ""}.`);
    }
    if (videoOptions.videoType) parts.push(`Type de vidéo : ${videoOptions.videoType}.`);
    if (videoOptions.characterType) parts.push(`Personnage à l'écran : ${videoOptions.characterType}.`);
    if (videoOptions.theme) parts.push(`Thème visuel : ${videoOptions.theme}.`);
    if (videoOptions.ambiance) parts.push(`Ambiance : ${videoOptions.ambiance}.`);
    parts.push(brief || "Vidéo promotionnelle soignée mettant le produit en valeur.");
    parts.push("Si la vidéo contient une voix, elle doit sonner comme une personne qui parle naturellement dans la scène filmée — jamais comme une description de la vidéo elle-même (ne jamais dire des phrases du type « vidéo présentant... » ou « voici une vidéo qui... ») — avec un débit calme et clair, sans jamais tomber dans un discours confus ou incompréhensible.");
    parts.push("La vidéo se termine par un dernier plan net et posé qui referme la scène, pas par une coupe brutale en plein mouvement.");
    return parts.filter(Boolean).join(" ").slice(0, 6000);
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
  ].filter(Boolean).join(" ").slice(0, 6000);
}
