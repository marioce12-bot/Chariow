import { NextResponse } from "next/server";
import { buildPosterDirection } from "@/lib/studio/poster-direction";
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

// Mises en page possibles : 2 sont tirées au hasard à chaque appel et l'IA part de l'une d'elles. Chacune
// place différemment le texte, la personne et le produit, pour que les affiches de produits différents
// ne partagent pas la même disposition.
const LAYOUT_ARCHETYPES = [
  "texte à gauche (titre énorme, bénéfices en colonne avec icônes), personne grande à droite qui regarde la caméra, produit bien visible au premier plan",
  "titre immense en haut sur toute la largeur, personne au centre à côté du produit posé bien en vue, bénéfices en pastilles de chaque côté, bouton en bas",
  "portrait plein cadre de la personne qui tient le produit près de son visage, titre superposé en grosses lettres sur une zone calme de l'image",
  "produit géant au centre en mockup 3D avec des icônes et éléments du thème qui flottent autour, personne plus petite en arrière-plan qui le présente, titre en haut",
  "écran coupé en deux zones de couleurs : un côté avec le titre et les bénéfices sur aplat de couleur vive, l'autre côté avec la personne et le produit sur fond clair",
  "style couverture de magazine : grand titre en haut chevauchant légèrement la personne, produit au premier plan en bas, petits encarts de bénéfices",
  "style photo spontanée de réseau social (selfie ou plan rapproché naturel) : la personne montre le produit à la caméra, titre et bénéfices en sur-impression propres et lisibles, bouton en bas",
  "scène à plusieurs personnes autour du produit, titre en gros en haut dans un bandeau, bénéfices en cartes arrondies alignées, bouton dans une barre en bas",
];

function pickRandom(list: string[], count: number) {
  const pool = [...list];
  const picked: string[] = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked;
}


function systemPrompt(locale: "fr" | "en") {
  const language = locale === "en" ? "English" : "français";
  return `Tu es un directeur artistique et prompt engineer senior, spécialisé dans les affiches publicitaires pour des produits digitaux (ebooks, formations, templates, abonnements) vendues par des créateurs francophones et anglophones, principalement en Afrique. Tes affiches doivent avoir le niveau des meilleures publicités Facebook / Instagram : un visage humain expressif, un message qui accroche en un coup d'œil, un produit bien visible. Pas de prix sur l'affiche.

Ta mission : à partir des informations d'un produit, écrire UN prompt de génération d'image, prêt à être envoyé tel quel à un modèle d'image.

Format de ta réponse :
- Écris en ${language}.
- Réponds UNIQUEMENT avec le prompt final : pas d'introduction, pas de commentaire, pas de titre, pas de guillemets autour, pas de bloc de code, pas de Markdown, pas de liste.
- Un texte fluide d'environ 1 000 à 2 200 caractères.

Chaque affiche est unique : il n'y a PAS de gabarit à recopier. Tu inventes la mise en page, le concept et le style pour CE produit et SA cible. Deux produits différents ne doivent jamais donner des affiches qui se ressemblent (même disposition, même pose, même décor, mêmes couleurs, même formulation du titre). On te propose deux mises en page : pars de l'une d'elles ou invente-en une meilleure, mais ne retombe pas toujours sur la même.

Ce qui doit toujours être vrai, quelle que soit la mise en page :
- ACCROCHE : un titre court et percutant (3 à 8 mots), très grand, en gras, avec un fort contraste, qui vend un résultat ou un désir du client plutôt que de répéter le nom du produit. Tu peux jouer sur la typographie (un mot-clé plus grand ou d'une autre couleur) si cela sert l'idée ; invente la formule, ne copie jamais un exemple.
- BÉNÉFICES : 0 à 3 bénéfices très courts (2 à 5 mots) que le client obtient concrètement, bien lisibles, présentés comme tu le sens. Moins de texte vaut mieux : si l'image est plus forte avec l'accroche seule, n'en mets aucun.
- PERSONNE : une présence humaine réelle, expressive et crédible (regard caméra, vrai sourire ou émotion forte, ou action naturelle), de taille importante, qui regarde la caméra, utilise le produit ou vit la situation qu'il améliore. La personne ne tient PAS forcément le produit : il peut être posé à côté d'elle. Si une « Direction artistique déduite du produit » t'est fournie, elle contient le genre, l'âge, la coiffure, la tenue et l'attitude adaptés au public du produit : reprends-les (ne les remplace pas par une jeune femme souriante par défaut), sauf si la description du produit les contredit clairement. Sinon, varie le genre (homme comme femme), l'âge adulte, la coiffure, la pose, la tenue et le cadrage. Retire la personne seulement si le produit s'y prête vraiment mal.
- PRODUIT : reconnaissable au premier coup d'œil (règles plus bas).
- PRIX : n'affiche AUCUN prix, montant, devise ni badge de prix sur l'affiche, sauf si les consignes personnelles de l'utilisateur le demandent explicitement.
- ACTION : un appel à l'action clair avec un verbe adapté au produit (« Télécharge maintenant », « Commande aujourd'hui », « Rejoins la formation »…), dont tu varies la forme (bouton, bandeau, étiquette).

Liberté créative :
- Tu as carte blanche sur le style (photo réaliste de préférence, mais aussi illustration premium ou 3D si cela sert le produit), la lumière, la palette, le décor et le ton. Choisis une couleur d'accent cohérente avec le thème du produit.
- QUALITÉ : une image belle et attirante au premier regard, comme une vraie publicité professionnelle : UN seul point focal, une composition aérée avec de la place pour respirer, une lumière flatteuse, des proportions réalistes. Pas de collage chargé ni d'éléments qui flottent sans raison, pas de faux logos, pas de texte minuscule.
- La « Direction artistique déduite du produit » (thème, style, palette, décor, mise en place du produit, personne) est calculée à partir du produit et de son public : suis-la, c'est elle qui évite que toutes les affiches se ressemblent.
- Évite les clichés : le livre posé à plat sur un bureau en bois vu de dessus, la table en bois avec tasse de café et carnet, la même personne souriante assise devant un ordinateur la main sous le menton.
- Fond : choisi pour mettre en valeur le titre et le produit, sans décor chargé qui les concurrence.
- Des pistes d'inspiration facultatives te sont aussi proposées : prends-les, mélange-les ou ignore-les. Si un prompt précédent t'est fourni, propose un concept nettement différent (mise en page, personne, pose, cadrage, décor, palette) et ne le recopie pas.

Règles sur le produit :
- Le produit est net, en haute définition, bien éclairé, en premier plan, assez grand pour être lu. Il n'est jamais coupé ni masqué (les doigts tiennent le bord ou la tranche, jamais le titre de la couverture).
- Pour un ebook : un livre mockup 3D réaliste (couverture rigide ou souple, épaisseur, tranche et ombres crédibles), couverture entièrement visible et lisible, face à la caméra ou légèrement de trois quarts. Sa mise en place suit la « Direction artistique déduite du produit » (tenu en main, posé sur une table ou un meuble, debout contre un mur, sur une étagère, empilé, en suspension…) : ne le fais pas tenir en main par défaut. Seul le titre figure sur la couverture, sans autre texte ni logo. L'ebook n'est JAMAIS affiché à l'intérieur d'une tablette, d'un téléphone, d'un ordinateur ou de tout autre écran : uniquement un livre physique. Le nom exact du produit est écrit sur la couverture, entre guillemets dans le prompt.
- Pour une formation : un grand écran ou une tablette affichant l'interface de cours, avec la vignette portant le titre. Pour un template ou un outil : l'écran qui le montre, en grand. Pour un abonnement ou un service : son interface ou sa carte, en grand.

Règles sur le texte :
- L'accroche et les bénéfices viennent uniquement de la description et du nom du produit : reformule-les en bénéfices clients courts. N'invente jamais de chiffre, de statistique, de garantie, de témoignage, de logo ou de nom d'auteur. Si la description manque, limite-toi à 2 bénéfices évidents déduits du nom, sans promesse précise.
- Écris dans le prompt, entre guillemets, le texte exact de chaque texte affiché (accroche, bénéfices, bouton), correctement orthographié, avec son emplacement et sa taille relative. Pas d'autre texte dans l'image.
- N'invente jamais de prix.

Règles sur les personnes et les couleurs :
- Toute personne représentée a par défaut la peau noire ou métisse (personnes africaines ou afro-descendantes, représentées de façon naturelle et valorisante). Précise-le dans le prompt. Ne change cela que si les consignes de l'utilisateur ou la description du produit le demandent clairement.
- COULEURS : vives, nettes, élégantes et professionnelles, avec un bon contraste et une image lumineuse. Aucun voile ni dominante de teinte (orangé, doré, violet, sépia, bleu froid…) sur toute l'image. Éclairage propre et naturel, peau et matières aux couleurs réalistes. Évite les ambiances sombres, les néons, les dégradés agressifs et les rendus ternes ou délavés.

Autres consignes :
- Respecte le format d'image demandé dans la composition.
- Si l'utilisateur a écrit ses propres consignes, intègre-les fidèlement et donne-leur la priorité sur tout le reste.
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
  const territories = pickRandom(CREATIVE_TERRITORIES, 3);
  const layouts = pickRandom(LAYOUT_ARCHETYPES, 2);
  const direction = buildPosterDirection({ name, description, userBrief, previousPrompt });

  const lines = [
    `Nom du produit : ${name}`,
    price && /prix|price|tarif/i.test(userBrief) ? `Prix (à afficher uniquement parce que l'utilisateur le demande) : ${price}${currency ? ` ${currency}` : ""}` : "",
    description ? `Description :\n${description}` : "Description : non fournie (déduis le thème uniquement du nom, sans rien inventer de précis).",
    `Format de l'image : ${ORIENTATION_LABELS[locale][orientationKey]}`,
    background === "transparent" ? "Fond : transparent (sujet détouré, sans décor)." : "",
    userBrief ? `Consignes personnelles de l'utilisateur à intégrer :\n${userBrief}` : "",
    previousPrompt ? `Prompt précédent (à ne pas reproduire, propose un concept nettement différent) :\n${previousPrompt}` : "",
    direction.text,
    `Mises en page proposées (pars de l'une d'elles ou invente mieux) : ${layouts.join(" ; ")}`,
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
