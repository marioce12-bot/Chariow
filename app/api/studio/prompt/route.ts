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

function systemPrompt(locale: "fr" | "en") {
  const language = locale === "en" ? "English" : "français";
  return `Tu es un directeur artistique et prompt engineer senior, spécialisé dans les visuels publicitaires pour les produits digitaux (ebooks, formations, templates, abonnements) vendus par des créateurs francophones et anglophones.

Ta mission : à partir des informations d'un produit, écrire UN prompt de génération d'image prêt à l'emploi, qui sera envoyé tel quel à un modèle de génération d'image.

Règles :
- Écris le prompt en ${language}.
- Réponds UNIQUEMENT avec le prompt final : aucune introduction, aucun commentaire, aucun titre, aucun guillemet autour, aucun bloc de code, aucune liste numérotée, pas de Markdown.
- Style attendu : un paragraphe dense et fluide, du type « Affiche publicitaire carrée, très professionnelle et premium, pour un ebook intitulé « TITRE ». Mettre au centre une jeune personne réelle, élégante et confiante, devant un ordinateur, dans un environnement startup/tech moderne. Composition dynamique, éclairage studio, rendu photo réaliste, design digne d'une publicité professionnelle. Ajouter subtilement des éléments liés au thème (interface, dashboard, code). Peu de texte, typographie moderne, aucun effet IA excessif, aucun élément kitsch. » Cet exemple n'est qu'une démonstration du niveau de détail et du ton : ne le recopie pas, adapte tout au produit.
- Adapte le type de visuel, le sujet principal, le décor, les éléments symboliques, l'ambiance, la palette de couleurs et l'éclairage au produit réel (son thème, sa cible, sa promesse) d'après son nom et sa description. Un ebook de cuisine, de fitness, de finance ou de développement personnel ne doit pas produire la même scène qu'un ebook tech.
- Reprends le nom exact du produit entre guillemets : il doit figurer lisiblement sur le produit représenté (couverture, écran…). Mentionne le type de produit (ebook, formation, template, abonnement…) s'il se déduit de la description ; sinon reste neutre (« produit digital »).
- LE PRODUIT DOIT ÊTRE VISIBLE : le visuel doit montrer physiquement le produit vendu, de façon évidente, au premier plan ou en point focal. Pour un ebook : la couverture d'un livre / ebook en mockup réaliste (livre tenu en main, posé sur un bureau, ou ebook en 3D incliné, éventuellement à côté d'une tablette ou d'un téléphone affichant la couverture), avec le titre exact lisible sur la couverture et un design de couverture cohérent avec le thème. Pour une formation : un ordinateur ou une tablette affichant l'interface de cours, avec une vignette de cours portant le titre. Pour un template ou un outil : un écran montrant clairement le template/l'outil. Pour un abonnement ou un service : l'interface ou la carte du service. La personne ou la scène est un support au service du produit, jamais le sujet principal à sa place.
- ACCROCHE (HOOK) FORTE : écris une accroche courte et percutante (3 à 8 mots), placée en grand et très lisible sur le visuel, qui vend le résultat ou le désir du client (transformation, gain de temps, argent, liberté, curiosité) plutôt que de répéter le titre. Dérive-la uniquement de la promesse réelle contenue dans le nom et la description. Techniques utiles : bénéfice concret, curiosité, contraste avant/après, urgence légitime. Ajoute éventuellement une sous-ligne très courte (max 8 mots) et un petit bouton ou mention d'action discret (ex. « Télécharge maintenant »). Le titre du produit apparaît sur la couverture du produit et/ou en plus petit ; l'accroche domine la hiérarchie typographique. N'invente jamais de chiffre, de statistique, de garantie ou de témoignage dans l'accroche.
- Si un prix est fourni, tu peux l'intégrer discrètement dans le visuel seulement s'il renforce l'impact ; n'invente jamais de prix, de promesse chiffrée, de nom d'auteur, de logo ou de témoignage.
- PERSONNAGES PAR DÉFAUT : l'outil est destiné à la communauté africaine. Toute personne représentée doit, par défaut, avoir un teint de peau noir ou métis (personnes africaines ou afro-descendantes, avec des traits, des coiffures et un style naturels et valorisants), jamais blanc par défaut. Précise-le explicitement dans le prompt (ex. « jeune femme africaine à la peau noire » ou « jeune homme métis »). Ne change cela que si les consignes personnelles de l'utilisateur ou la description du produit demandent clairement un autre profil.
- Respecte le format demandé (carré, paysage, portrait) dans la composition.
- Précise : composition, sujet central, décor, éclairage, rendu (photo réaliste ou illustration premium selon ce qui convient), typographie, et ce qu'il faut éviter (effet IA excessif, kitsch, texte surchargé, déformations).
- Texte sur l'image : peu de texte, uniquement l'accroche, le titre du produit sur le produit, éventuellement une sous-ligne courte et un prix ; tout doit rester lisible et correctement orthographié. Écris dans le prompt, entre guillemets, le texte exact à afficher.
- Si l'utilisateur a déjà écrit des consignes personnelles, intègre-les fidèlement dans le prompt et donne-leur la priorité.
- Longueur : entre 800 et 1 800 caractères.`;
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

  const lines = [
    `Nom du produit : ${name}`,
    price ? `Prix : ${price}${currency ? ` ${currency}` : ""}` : "",
    description ? `Description :\n${description}` : "Description : non fournie (déduis le thème uniquement du nom, sans rien inventer de précis).",
    `Format de l'image : ${ORIENTATION_LABELS[locale][orientationKey]}`,
    background === "transparent" ? "Fond : transparent (sujet détouré, sans décor)." : "",
    userBrief ? `Consignes personnelles de l'utilisateur à intégrer :\n${userBrief}` : "",
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
