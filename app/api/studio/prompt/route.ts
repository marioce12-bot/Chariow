import { NextResponse } from "next/server";
import { buildPosterDirection } from "@/lib/studio/poster-direction";
import { buildLayoutDirection, type PersonMode } from "@/lib/studio/poster-layouts";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";
import { cleanAiText } from "@/lib/ai/format";

const MAX_PROMPT_CHARS = 3_800;

const ORIENTATION_LABELS = {
  fr: { square: "carré (1:1)", landscape: "paysage (horizontal)", portrait: "portrait (vertical)" },
  en: { square: "square (1:1)", landscape: "landscape (horizontal)", portrait: "portrait (vertical)" },
} as const;

function systemPrompt(locale: "fr" | "en") {
  const language = locale === "en" ? "English" : "français";
  return `Tu es un directeur artistique senior, spécialiste des affiches de vente de produits digitaux (ebook, formation, template, logiciel, abonnement…) diffusées sur Facebook, Instagram, WhatsApp et TikTok, pour des créateurs francophones ou anglophones, principalement en Afrique. Tu écris UN prompt prêt à être envoyé tel quel à un modèle de génération d'image.

Une affiche qui vend est d'abord un TITRE qu'on lit à deux mètres, ensuite un visuel. Tu ne fais pas une photo de stock avec une petite légende : tu fais une vraie affiche publicitaire, avec une hiérarchie de texte claire.

La mise en page et la palette te sont IMPOSÉES dans les informations du produit : applique fidèlement leur structure (emplacement du titre, du produit, des bénéfices, du bouton, présence ou non d'une personne, style graphique) et décris-la élément par élément dans le prompt. Tu adaptes le décor, les icônes, les accessoires, la tenue et les bénéfices au produit, jamais la structure. Réfléchis d'abord à qui achète ce produit et quel désir ou problème il touche, puis écris les textes à partir de là.

Format de ta réponse :
- Écris en ${language}.
- Réponds UNIQUEMENT avec le prompt final : pas d'introduction, pas de commentaire, pas de titre, pas de guillemets autour, pas de bloc de code, pas de Markdown, pas de liste.
- Un texte fluide d'environ 1 000 à 2 400 caractères, qui décrit la mise en page, le style, la lumière, les couleurs, la place, la taille et la couleur de chaque texte et de chaque élément.

Le TEXTE dans l'image (c'est la priorité n° 1) :
- Un TITRE principal de 3 à 8 mots, qui vend un résultat ou un désir (pas seulement le nom du produit), en très gros caractères gras sans empattement, qui occupe au moins un quart de l'image, avec un contraste très fort avec le fond. Précise dans le prompt sa taille (énorme), sa position, ses couleurs et le mot mis en valeur. Jamais de titre minuscule, jamais de texte posé sur une zone chargée sans bloc de couleur ou ombre derrière.
- Autour du titre, selon la mise en page imposée : une sous-ligne, 2 ou 3 bénéfices très courts (3 à 5 mots) avec icônes, un autocollant ou badge, un appel à l'action dans un bouton. Au total 20 à 40 mots maximum, tous lisibles, bien espacés.
- Écris entre guillemets, dans le prompt, chaque texte exact, en français correct avec ses accents, et demande une orthographe parfaite. Aucun autre texte.
- Une phrase d'accroche seule en petit en bas de l'image est interdite.

Ce qui ne se négocie pas :
- Image belle et nette au premier regard, comme une vraie publicité professionnelle : un point focal clair, de l'air entre les éléments, des proportions réalistes, des couleurs franches.
- Les couleurs collent à l'univers du produit : si le produit parle d'une marque ou d'une plateforme connue (LinkedIn, WhatsApp, TikTok…), reprends ses couleurs ; un produit professionnel ou business a une palette sobre et crédible, jamais rose ou bordeaux.
- Le produit est reconnaissable, net, grand, bien visible et jamais coupé ni masqué. Un ebook est toujours un livre physique (jamais dans un écran), avec son titre exact sur la couverture et aucun autre texte ni logo dessus. Une formation, un outil ou un abonnement peut être montré par son écran ou son interface.
- N'affiche aucun prix, montant ni devise, sauf si l'utilisateur le demande explicitement. N'invente jamais de chiffre, de statistique, de garantie, de témoignage, de logo ou de nom d'auteur : tout vient du nom et de la description du produit (si la description manque, déduis le thème du nom sans rien inventer de précis).
- Toute personne représentée a par défaut la peau noire ou métisse (personnes africaines ou afro-descendantes, représentées de façon naturelle et valorisante) ; précise-le dans le prompt. Ne change cela que si l'utilisateur ou la description du produit le demandent clairement.
- Si l'utilisateur a choisi explicitement d'avoir ou de ne pas avoir de personne sur l'affiche, respecte ce choix à la lettre.
- Respecte le format d'image demandé.
- Chaque génération doit ressembler à une affiche différente des précédentes : structure, style (photo, 3D, illustration plate, collage…), décor, personne. Si un prompt précédent t'est fourni, ne reprends ni sa structure, ni son décor, ni sa personne.
- Si l'utilisateur a écrit ses propres consignes, intègre-les fidèlement et donne-leur la priorité sur tout le reste, y compris sur la mise en page imposée.
- Termine par une courte phrase sur ce qu'il faut éviter (mains ou visages déformés, fautes dans les textes, titre trop petit, effets d'IA excessifs).`;
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
  const person: PersonMode = body?.person === "with" || body?.person === "without" ? body.person : "auto";
  const price = typeof product?.price === "number" || typeof product?.price === "string" ? String(product.price).slice(0, 40) : "";
  const currency = typeof product?.currency === "string" ? product.currency.slice(0, 10) : "";
  const description = typeof product?.description === "string" ? product.description.trim().slice(0, 3_000) : "";
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 1_500) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 1_800) : "";
  const direction = buildPosterDirection({ name, description, userBrief, previousPrompt });
  const layout = buildLayoutDirection({ orientation: orientationKey, productText: `${name} ${description}`, person, userBrief, previousPrompt });

  const lines = [
    `Nom du produit : ${name}`,
    price && /prix|price|tarif/i.test(userBrief) ? `Prix (à afficher uniquement parce que l'utilisateur le demande) : ${price}${currency ? ` ${currency}` : ""}` : "",
    description ? `Description :\n${description}` : "Description : non fournie (déduis le thème uniquement du nom, sans rien inventer de précis).",
    `Format de l'image : ${ORIENTATION_LABELS[locale][orientationKey]}`,
    background === "transparent" ? "Fond : transparent (sujet détouré, sans décor)." : "",
    userBrief ? `Consignes personnelles de l'utilisateur à intégrer :\n${userBrief}` : "",
    previousPrompt ? `Prompt précédent (à ne pas reproduire : change de structure, de style et de personne) :\n${previousPrompt}` : "",
    direction.text,
    layout.text,
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
