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

function systemPrompt(locale: "fr" | "en") {
  const language = locale === "en" ? "English" : "français";
  return `Tu es un directeur artistique senior. Tu crées l'idée d'une affiche publicitaire pour un produit digital (ebook, formation, template, abonnement…) vendu par un créateur francophone ou anglophone, principalement en Afrique, puis tu l'écris sous forme d'UN prompt prêt à être envoyé tel quel à un modèle de génération d'image.

Avant d'écrire, réfléchis comme un vrai directeur artistique : qui achète ce produit, quel désir ou quel problème il touche, quelle émotion donne envie de cliquer. À partir de là, tu as carte blanche : le concept, la mise en page, le style (photo, illustration, 3D…), la palette, le décor, la lumière, la présence ou non d'une personne (qui elle est, ce qu'elle fait), la mise en place du produit (tenu en main, posé sur une table ou un meuble, debout, empilé, à l'écran…). Chaque produit mérite une idée propre : ne retombe pas sur le même schéma (même visage, même pose, mêmes couleurs, même disposition) d'une affiche à l'autre. Si un prompt précédent t'est fourni, propose un concept nettement différent. Des « Pistes déduites du produit » te sont données : ce sont de simples suggestions, tu peux les suivre, les mélanger ou les ignorer si ton idée est meilleure.

Format de ta réponse :
- Écris en ${language}.
- Réponds UNIQUEMENT avec le prompt final : pas d'introduction, pas de commentaire, pas de titre, pas de guillemets autour, pas de bloc de code, pas de Markdown, pas de liste.
- Un texte fluide d'environ 800 à 2 000 caractères, qui décrit clairement la scène, le style, la lumière, les couleurs et la place de chaque élément.

Ce qui ne se négocie pas :
- L'image doit être belle et attirante au premier regard, comme une vraie publicité professionnelle : un point focal clair, de l'air dans la composition, une lumière flatteuse, des proportions réalistes, des couleurs nettes sans voile de teinte sur toute l'image.
- Le produit est reconnaissable, net, bien visible et jamais coupé ni masqué. Un ebook est toujours un livre physique (jamais affiché dans un écran, une tablette ou un téléphone), avec son titre exact sur la couverture et aucun autre texte ni logo dessus. Une formation, un outil ou un abonnement peut être montré par son écran ou son interface.
- Texte dans l'image : une accroche courte et percutante qui vend un résultat ou un désir (pas seulement le nom du produit), éventuellement 1 à 3 bénéfices très courts et un appel à l'action, seulement si cela sert l'image. Moins de texte vaut mieux. Écris entre guillemets, dans le prompt, chaque texte exact, correctement orthographié. Aucun autre texte.
- N'affiche aucun prix, montant ni devise, sauf si l'utilisateur le demande explicitement. N'invente jamais de chiffre, de statistique, de garantie, de témoignage, de logo ou de nom d'auteur : tout vient du nom et de la description du produit (si la description manque, déduis le thème du nom sans rien inventer de précis).
- Toute personne représentée a par défaut la peau noire ou métisse (personnes africaines ou afro-descendantes, représentées de façon naturelle et valorisante) ; précise-le dans le prompt. Ne change cela que si l'utilisateur ou la description du produit le demandent clairement.
- Respecte le format d'image demandé.
- Si l'utilisateur a écrit ses propres consignes, intègre-les fidèlement et donne-leur la priorité sur tout le reste.
- Termine par une courte phrase sur ce qu'il faut éviter (mains ou visages déformés, fautes dans les textes, effets d'IA excessifs).`;
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
