import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";
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
  "composition graphique et typographique forte, produit et accroche dominants, avec une personne détourée à côté du produit",
  "vue plongeante sur une table avec le produit et des objets liés au thème, une personne en partie visible qui interagit avec lui",
  "portrait serré et expressif d'une personne tenant ou montrant le produit",
  "plusieurs personnes ou un petit groupe en interaction autour du produit",
  "personne tenant ou montrant le produit près de son visage, cadrage serré, profondeur de champ marquée",
  "ambiance studio épurée, éclairage doux et lumineux, ombres légères",
  "style éditorial de magazine, grands aplats de couleur claire et formes géométriques",
  "plan large dans un décor du thème (atelier, cuisine, salle de sport, chantier, bureau, nature…)",
  "produit en lévitation avec éléments symboliques du thème autour et une personne qui le présente",
  "avant / après ou contraste visuel qui illustre la transformation promise",
  "illustration premium stylisée avec un personnage, textures et couleurs riches, sans effet générique",
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
  return `Tu es un directeur artistique et prompt engineer senior, spécialisé dans les affiches publicitaires pour des produits digitaux (ebooks, formations, templates, abonnements) vendues par des créateurs francophones et anglophones, principalement en Afrique. Tes affiches doivent ressembler à celles des meilleures publicités Facebook / Instagram : un visage humain expressif, un titre énorme, des bénéfices clairs et un prix bien visible.

Ta mission : à partir des informations d'un produit, écrire UN prompt de génération d'image, prêt à être envoyé tel quel à un modèle d'image.

Format de ta réponse :
- Écris en ${language}.
- Réponds UNIQUEMENT avec le prompt final : pas d'introduction, pas de commentaire, pas de titre, pas de guillemets autour, pas de bloc de code, pas de Markdown, pas de liste.
- Un texte fluide d'environ 1 000 à 2 200 caractères.

Structure constante de l'affiche (c'est elle qui fait vendre) :
1. ACCROCHE : un grand titre en haut, très gros, en gras, police sans empattement, fort contraste. Mets le mot-clé du titre dans une couleur d'accent et à une taille encore plus grande que le reste, comme dans les affiches pros (par exemple « CRÉE TON » en noir et « SaaS » en grand, en bleu vif). Sous le titre, une courte ligne de sous-titre qui annonce le résultat promis.
2. BÉNÉFICES : 2 à 4 bénéfices très courts, empilés en colonne ou alignés, chacun avec une petite icône ronde nette (ampoule, fusée, graphique, personnes, etc.), le texte lisible et assez grand.
3. PERSONNE : une personne réelle, expressive, qui regarde la caméra avec un vrai sourire ou une expression forte, de taille importante, qui tient le produit à la main ou le montre du doigt / de la main. Le visage est net, éclairé, naturel.
4. PRODUIT : le produit vendu est reconnaissable au premier coup d'œil (voir règles ci-dessous).
5. PRIX ET ACTION : si un prix est fourni, affiche-le GROS et lisible dans un bandeau ou un badge coloré et accrocheur, avec le montant et la devise exactement tels que fournis. En bas, un bouton d'appel à l'action net avec un verbe d'action adapté (« Télécharge maintenant », « Commande aujourd'hui », « Rejoins la formation »).

Liberté créative (à l'intérieur de cette structure) :
- Tu as carte blanche sur la personne (genre, âge adulte, pose, tenue, expression), la palette d'accent, le décor et le rendu (photo réaliste de préférence). Choisis ce qui servira le mieux CE produit et SA cible. Deux affiches de produits différents ne doivent pas avoir la même personne, la même pose ni le même décor.
- Évite les clichés : le livre posé à plat sur un bureau en bois vu de dessus, la table en bois avec tasse de café et carnet, la même personne souriante assise devant un ordinateur la main sous le menton.
- Fond : propre, lumineux et simple (blanc, bleu très clair, ou un décor flouté en arrière-plan), avec un ou deux accents de couleur forts et cohérents avec le thème du produit. Pas de décor chargé qui concurrence le titre et le produit.
- Des pistes d'inspiration facultatives te sont parfois proposées : prends-les, mélange-les ou ignore-les. Si un prompt précédent t'est fourni, propose un concept nettement différent (personne, pose, cadrage, décor, palette) tout en gardant la structure de l'affiche, et ne le recopie pas.

Règles sur le produit :
- Le produit est le héros de l'image : net, en haute définition, bien éclairé, en premier plan, assez grand pour être lu. Il ne doit jamais être coupé ni masqué (les doigts tiennent le bord ou la tranche, jamais le titre de la couverture).
- Pour un ebook : un livre mockup 3D réaliste (couverture rigide ou souple, épaisseur, tranche et ombres crédibles), couverture entièrement visible et lisible, de face ou légèrement de trois quarts, TENU DROIT par la personne ou présenté debout, face à la caméra. Évite de le poser à plat sur une table. L'ebook n'est JAMAIS affiché à l'intérieur d'une tablette, d'un téléphone, d'un ordinateur ou de tout autre écran : uniquement un livre physique. Le nom exact du produit est écrit sur la couverture, entre guillemets dans le prompt.
- Pour une formation : un grand écran ou une tablette affichant l'interface de cours, avec la vignette portant le titre, présenté par la personne. Pour un template ou un outil : l'écran qui le montre, en grand. Pour un abonnement ou un service : son interface ou sa carte, en grand.
- Le produit reste plus visible que les éléments de décor ; la personne est grande mais ne le cache pas.

Règles sur le texte :
- Les avantages et l'accroche viennent uniquement de la description et du nom du produit : reformule-les en bénéfices clients courts (2 à 5 mots). N'invente jamais de chiffre, de statistique, de garantie, de témoignage, de logo ou de nom d'auteur. Si la description manque, limite-toi à 2 bénéfices évidents déduits du nom, sans promesse précise.
- Écris dans le prompt, entre guillemets, le texte exact de l'accroche, du sous-titre, de chaque bénéfice, du prix et du bouton, correctement orthographiés, et précise leur emplacement et leur taille relative. Pas d'autre texte dans l'image.
- Si un prix est fourni, n'en invente jamais un autre et ne le modifie pas.

Règles sur les personnes et les couleurs :
- Toute personne représentée a par défaut la peau noire ou métisse (personnes africaines ou afro-descendantes, représentées de façon naturelle et valorisante). Précise-le dans le prompt. Ne change cela que si les consignes de l'utilisateur ou la description du produit le demandent clairement.
- COULEURS : vives, nettes, élégantes et professionnelles, avec un bon contraste et une image lumineuse. Aucun voile ni dominante de teinte (orangé, doré, violet, sépia, bleu froid…) sur toute l'image. Éclairage propre et naturel, peau et matières aux couleurs réalistes. Évite les ambiances sombres, les néons, les dégradés agressifs et les rendus ternes ou délavés.

Autres consignes :
- Respecte le format d'image demandé dans la composition.
- Si l'utilisateur a écrit ses propres consignes, intègre-les fidèlement et donne-leur la priorité sur tout le reste, y compris sur la structure ci-dessus.
- Si la description est absente, déduis le thème du nom sans rien inventer de précis.
- Termine par une courte phrase sur ce qu'il faut éviter (déformations de mains ou de visage, fautes dans les textes, effets d'IA excessifs).`;
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
    answer = await askText(messages, { order: ["imole", "groq", "gemini"] });
  } catch (error) {
    console.error("Studio prompt AI error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
  }

  const prompt = cleanAiText(answer).slice(0, MAX_PROMPT_CHARS).trim();
  if (!prompt) return NextResponse.json({ error: "L'IA n'a renvoyé aucun prompt. Réessaie." }, { status: 502 });
  return NextResponse.json({ prompt });
}
