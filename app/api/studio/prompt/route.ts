import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";
import { askGemini } from "@/lib/ai/gemini";
import { cleanAiText } from "@/lib/ai/format";

const MAX_PROMPT_CHARS = 3_800;

const ORIENTATION_LABELS = {
  fr: { square: "carré (1:1)", landscape: "paysage (horizontal)", portrait: "portrait (vertical)" },
  en: { square: "square (1:1)", landscape: "landscape (horizontal)", portrait: "portrait (vertical)" },
} as const;

// Pistes créatives facultatives : 3 sont tirées au hasard à chaque appel et proposées
// comme simple inspiration (l'IA peut les ignorer). Elles servent uniquement à éviter
// que deux générations successives partent de la même idée.
const CREATIVE_TERRITORIES = [
  "gros plan sur le produit en mockup 3D, fond clair uni et ombres douces",
  "scène de vie quotidienne africaine authentique (maison, café, marché, terrasse, transport…)",
  "composition graphique très typographique, produit et accroche dominants, peu de photo",
  "vue du dessus (flat lay) avec objets liés au thème autour du produit",
  "portrait serré et expressif d'une personne tenant ou montrant le produit",
  "plusieurs personnes ou un petit groupe en interaction autour du produit",
  "mains seules manipulant le produit, cadrage serré, profondeur de champ marquée",
  "ambiance studio épurée, éclairage doux et lumineux, ombres légères",
  "style éditorial de magazine, grands aplats de couleur claire et formes géométriques",
  "plan large dans un décor du thème (atelier, cuisine, salle de sport, chantier, bureau, nature…)",
  "produit flottant en lévitation avec éléments symboliques du thème autour",
  "avant / après ou contraste visuel qui illustre la transformation promise",
  "illustration premium stylisée, texture et couleurs riches, sans effet générique",
  "photo lifestyle lumineuse en extérieur, lumière naturelle douce, mouvement et spontanéité",
];

function pickTerritories(count: number) {
  const pool = [...CREATIVE_TERRITORIES];
  const picked: string[] = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked;
}

function systemPrompt(locale: "fr" | "en") {
  const language = locale === "en" ? "English" : "français";
  return `Tu es un directeur artistique et prompt engineer senior, spécialisé dans les visuels publicitaires pour des produits digitaux (ebooks, formations, templates, abonnements) vendus par des créateurs francophones et anglophones, principalement en Afrique.

Ta mission : à partir des informations d'un produit, écrire UN prompt de génération d'image, prêt à être envoyé tel quel à un modèle d'image.

Format de ta réponse :
- Écris en ${language}.
- Réponds UNIQUEMENT avec le prompt final : pas d'introduction, pas de commentaire, pas de titre, pas de guillemets autour, pas de bloc de code, pas de Markdown, pas de liste.
- Un texte fluide d'environ 800 à 1 800 caractères.

Liberté créative :
- Tu as carte blanche sur le style, le concept, la mise en scène, le cadrage, la lumière, la palette, le décor et le rendu (photo, illustration, 3D, graphique…). Choisis ce qui servira le mieux CE produit et SA cible.
- Chaque prompt doit être singulier. Évite les automatismes : par exemple la même personne souriante assise à un bureau devant un ordinateur, la main sous le menton, la même pose ou le même décor d'un produit à l'autre. Une personne n'est jamais obligatoire : tu peux n'en mettre aucune, une seule, ou plusieurs, de n'importe quel genre et âge adulte, dans n'importe quelle pose ou action.
- Des pistes d'inspiration facultatives te sont parfois proposées : prends-les, mélange-les ou ignore-les. Si un prompt précédent t'est fourni, propose un concept nettement différent (sujet, pose, cadrage, décor, palette) et ne le recopie pas.

Quelques points à respecter toujours :
- Le produit vendu est le héros absolu de l'image : il doit être IMPOSANT, net et reconnaissable au premier coup d'œil. Il occupe environ 40 à 55 % de la surface de l'image, au premier plan, bien éclairé, en haute définition, sans être caché ni coupé par un personnage, une main, un téléphone ou un décor. Pour un ebook, montre un livre ou un ebook en grand mockup réaliste (couverture entièrement visible et lisible, épaisseur et ombres crédibles, éventuellement deux ou trois exemplaires, ou ebook sur tablette en grand), avec le nom exact du produit lisible sur la couverture, entre guillemets dans le prompt. Pour une formation : un grand écran ou une tablette affichant l'interface de cours, avec la vignette portant le titre. Pour un template ou un outil : l'écran qui le montre, en grand. Pour un abonnement ou un service : son interface ou sa carte, en grand. Les personnages, objets et éléments de décor restent secondaires, plus petits que le produit, et ne le masquent jamais.
- Le message de vente doit être complet mais lisible, avec une hiérarchie claire : (1) une accroche courte et percutante (3 à 8 mots), en grand, qui vend un résultat ou un désir du client plutôt que de répéter le titre ; (2) un mini-brief des avantages du produit : 2 à 4 bénéfices très courts (2 à 5 mots chacun), présentés sous forme de pastilles, d'icônes ou de puces stylisées, qui disent concrètement ce que le client obtient ; (3) un appel à l'action visible, sous forme de bouton ou de bandeau net, avec un verbe d'action adapté au produit (ex. « Télécharge maintenant », « Commande aujourd'hui », « Rejoins la formation »), mis en valeur sans écraser le reste.
- Les avantages et l'accroche viennent uniquement de la description et du nom du produit : reformule-les en bénéfices clients courts. N'invente jamais de chiffre, de statistique, de garantie, de témoignage, de logo ou de nom d'auteur. Si la description manque, limite-toi à 2 bénéfices évidents déduits du nom, sans promesse précise.
- Écris dans le prompt, entre guillemets, le texte exact de l'accroche, de chaque avantage et du bouton d'action, correctement orthographiés. Le texte doit rester lisible et ne pas surcharger l'image : privilégie une composition aérée où le produit reste le point focal.
- Toute personne représentée a par défaut la peau noire ou métisse (personnes africaines ou afro-descendantes, représentées de façon naturelle et valorisante). Précise-le dans le prompt. Ne change cela que si les consignes de l'utilisateur ou la description du produit le demandent clairement.
- PALETTE : couleurs claires, lumineuses et professionnelles. Fonds clairs (blanc cassé, crème, gris très clair, pastels doux ou aplats clairs) avec un ou deux accents de couleur maîtrisés et harmonieux, choisis selon le thème du produit. Éclairage doux, propre et uniforme, rendu net, élégant et crédible. Évite les ambiances sombres, les fonds noirs ou très foncés, les néons, les dégradés violets agressifs, les orangés saturés, la lumière dorée de coucher de soleil et les couleurs criardes.
- Respecte le format d'image demandé dans la composition.
- Si un prix est fourni, tu peux l'intégrer discrètement s'il renforce l'impact ; n'en invente jamais.
- Si l'utilisateur a écrit ses propres consignes, intègre-les fidèlement et donne-leur la priorité.
- Si la description est absente, déduis le thème du nom sans rien inventer de précis.
- Indique en quelques mots ce qu'il faut éviter (texte surchargé, déformations, effets d'IA excessifs).`;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => null);
  const product = body?.product && typeof body.product === "object" ? body.product as Record<string, unknown> : null;
  const name = typeof product?.name === "string" ? product.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "Choisis d'abord un produit." }, { status: 400 });

  const locale: "fr" | "en" = body?.locale === "en" ? "en" : "fr";
  const orientationKey: "square" | "landscape" | "portrait" = body?.orientation === "landscape" ? "landscape" : body?.orientation === "portrait" ? "portrait" : "square";
  const background = typeof body?.background === "string" ? body.background : "auto";
  const price = typeof product?.price === "number" || typeof product?.price === "string" ? String(product.price).slice(0, 40) : "";
  const currency = typeof product?.currency === "string" ? product.currency.slice(0, 10) : "";
  const description = typeof product?.description === "string" ? product.description.trim().slice(0, 3_000) : "";
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 1_500) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 1_800) : "";
  const territories = pickTerritories(3);

  const lines = [
    `Nom du produit : ${name}`,
    price ? `Prix : ${price}${currency ? ` ${currency}` : ""}` : "",
    description ? `Description :\n${description}` : "Description : non fournie (déduis le thème uniquement du nom, sans rien inventer de précis).",
    `Format de l'image : ${ORIENTATION_LABELS[locale][orientationKey]}`,
    background === "transparent" ? "Fond : transparent (sujet détouré, sans décor)." : "",
    userBrief ? `Consignes personnelles de l'utilisateur à intégrer :\n${userBrief}` : "",
    previousPrompt ? `Prompt précédent (à ne pas reproduire, propose un concept nettement différent) :\n${previousPrompt}` : "",
    `Pistes d'inspiration facultatives : ${territories.join(" ; ")}`,
  ].filter(Boolean).join("\n");

  const messages = [
    { role: "system" as const, content: systemPrompt(locale) },
    { role: "user" as const, content: `Voici les informations du produit :\n\n${lines}\n\nÉcris le prompt de génération d'image.` },
  ];

  let answer: string;
  try {
    answer = await askImole(messages);
  } catch (imoleError) {
    console.error("Studio prompt Imole error", imoleError instanceof Error ? imoleError.message : imoleError);
    try {
      answer = await askGemini(messages);
    } catch (geminiError) {
      console.error("Studio prompt Gemini error", geminiError instanceof Error ? geminiError.message : geminiError);
      return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
    }
  }

  const prompt = cleanAiText(answer).slice(0, MAX_PROMPT_CHARS).trim();
  if (!prompt) return NextResponse.json({ error: "L'IA n'a renvoyé aucun prompt. Réessaie." }, { status: 502 });
  return NextResponse.json({ prompt });
}
