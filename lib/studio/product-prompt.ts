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
const AUDIO_SECTION =
  "AUDIO : le seul son parlé vient des personnes filmées, qui s'expriment ou dialoguent naturellement entre elles dans leurs propres mots, dans la langue du brief. Personne ne cite ni ne paraphrase les sections ci-dessus, personne ne dit de phrases comme « vidéo montrant » ou « publicité UGC », et il n'y a aucune voix off extérieure qui décrit ou résume la scène.";

// Palette de mises en scène possibles — le modèle choisit ou combine celle(s)
// qui servent le mieux le brief, plutôt que de se limiter au seul format
// "témoignage face caméra".
const STYLE_SECTION =
  "STYLE : choisis, seul ou en combinaison, le type de mise en scène qui capte le mieux l'attention pour ce brief — témoignage UGC solo filmé au smartphone façon story ; plan cinématographique d'ouverture pour poser l'ambiance (ex. un lever ou coucher de soleil en accéléré, une ville qui s'éveille ou s'endort, un plan large qui installe un lieu) ; une personne montrée en train de vivre concrètement le problème que résout le produit ; ou une scène/dialogue entre deux personnages ou plus, comme un mini-film, avec un échange naturel plutôt qu'un monologue face caméra. Le format n'est pas figé : varie les plans (large, moyen, gros plan) comme dans un vrai montage publicitaire.";

function narrativeStructure(showcaseLine: string) {
  return [
    "STRUCTURE (adapte le nombre de plans à la durée, mais garde cet enchaînement) :",
    "1. Accroche (0-3 s) — un plan qui capte immédiatement l'œil : image forte, mise en situation, ou ouverture cinématographique.",
    "2. Problème — une scène concrète qui montre la situation ou la frustration que le produit résout, incarnée par un ou plusieurs personnages.",
    `3. Révélation du produit — ${showcaseLine}`,
    "4. Bénéfice / transformation — la situation change visiblement : soulagement, résultat, réaction positive des personnages.",
    "5. Appel à l'action clair — un geste ou une réplique qui invite explicitement à agir maintenant.",
  ].join(" ");
}

export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false) {
  const brief = userPrompt.trim();
  if (kind === "video" && !product) {
    return [
      STYLE_SECTION,
      narrativeStructure(
        "le produit ou l'offre doit être clairement visible à l'écran à un moment du plan-séquence (objet, écran qui l'affiche, ou représentation concrète), pas seulement évoqué en parole.",
      ),
      `SUJET : ${brief || "présente clairement l'offre avec un bénéfice concret et un appel à l'action."} Les personnages improvisent leurs propres mots pour parler de ce sujet, jamais en lisant cette consigne.`,
      "RÉALISATION : gestes et expressions naturels, lumière quotidienne ou cinématographique selon la scène choisie, caméra stable (légèrement mobile si style UGC), cadrage vertical si le format est vertical, transitions simples entre les plans. Continuité des visages, vêtements, du produit et du décor quand la même scène se poursuit. Pas de mains ou visages déformés, pas de changement d'identité incohérent, pas de texte incrusté illisible.",
      AUDIO_SECTION,
    ].join("\n").slice(0, 4000);
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
    STYLE_SECTION,
    `PRODUIT : « ${product.name} ».${product.description ? ` Description : ${product.description}` : ""}${priceLine ? ` ${priceLine}` : ""}${hasReference ? " Une image de référence donne sa couverture : conserve fidèlement son apparence (forme, couleurs, titre), ne la déforme pas." : ""}`,
    narrativeStructure(
      `on doit voir clairement « ${product.name} » à l'écran à un moment de la scène (couverture, appareil qui l'affiche, ou représentation concrète), pas seulement en entendre parler.`,
    ),
    `SUJET : ${brief || defaultBrief} Les personnages improvisent leurs propres mots pour parler de ce produit, jamais en lisant cette consigne.`,
    "RÉALISATION : gestes et expressions naturels, lumière quotidienne ou cinématographique selon la scène choisie, caméra stable (légèrement mobile si style UGC), transitions simples entre les plans. Continuité des visages, vêtements, du produit et du décor quand la même scène se poursuit. Pas de mains ou visages déformés, pas de changement d'identité incohérent, pas de texte incrusté illisible. N'invente ni prix, ni logo, ni caractéristique, ni promesse absents des informations ci-dessus.",
    AUDIO_SECTION,
  ].join("\n").slice(0, 4000);
}
