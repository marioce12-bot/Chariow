import { NextResponse } from "next/server";
import { buildPosterDirection } from "@/lib/studio/poster-direction";
import { buildLayoutDirection, type CharacterChoice } from "@/lib/studio/poster-layouts";
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
  return `Tu es directeur artistique spécialisé dans les publicités premium pour produits digitaux. Écris un prompt prêt à envoyer à un modèle d'image, fidèle aux informations réellement fournies.
Conçois une affiche lisible sur mobile avec une hiérarchie claire, un point focal et une composition aboutie. Choisis librement une structure vraiment adaptée au produit; ne réutilise pas systématiquement bulles, pilules, cartes, géométrie, boutons, palettes ou gabarits. Fais varier placement, cadrage, échelle, espace négatif, profondeur et langage visuel; chaque choix doit servir le produit et non une recette fixe.
Déduis la palette du vrai produit, de sa description et, si elles sont présentes, des images de référence. Les couleurs/identité visibles dans les références pertinentes priment sur une palette générique; aucune couleur n'est imposée.
La présence d'une personne est un choix de direction, pas une obligation. Respecte strictement « avec personnage » et « sans personnage »; en mode automatique, décide librement si une personne est utile ou si l'affiche fonctionne mieux sans. Ne présume ni homme, ni blazer, ni profil démographique non décrit.
Montre le produit conformément à sa nature et aux éléments fournis. Un bundle reste un ensemble cohérent de ses composants, pas un livre unique. Ne transforme pas arbitrairement un produit en ebook, livre ou boîte. Ne fabrique ni contenu, caractéristiques, interface, écran, bonus, nombre, résultat, promesse, logo ou texte absent des données. Si la forme physique ou l'interface n'est pas connue, privilégie une représentation graphique abstraite, symbolique ou éditoriale, sans fausse interface ni emballage inventé. Pour une personne ou des références explicitement fournies, respecte leur contenu sans les déformer.
Les textes visibles doivent être concis, lisibles et fondés uniquement sur le nom, la description et les consignes utilisateur. N'affiche aucun prix sauf demande explicite. Respecte l'orientation et le fond demandé.
Réponds uniquement avec le prompt final, sans introduction ni Markdown. Écris les instructions de rendu en anglais, mais conserve les textes visibles exactement en ${language}. Termine par les défauts à éviter, notamment texte illisible, produit déformé ou inventé, faux détails d'interface, clichés de mise en page et artefacts.`;
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
  const productImage = typeof product?.image === "string" && /^https:\/\//i.test(product.image) ? product.image.slice(0, 2_000) : "";
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 1_500) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 1_800) : "";
  // Personne par défaut (auto). « without » seulement si le client l'envoie, si le fond est transparent ou si les consignes le demandent.
  const requested: CharacterChoice = body?.character === "with" ? "with" : body?.character === "without" ? "without" : "auto";
  const character: CharacterChoice = requested === "auto" && /(sans personne|sans personnage|pas de personne|pas de personnage|aucune personne|no person|without (a )?(person|people|character))/i.test(userBrief) ? "without" : requested;
  const direction = buildPosterDirection({ name, description, userBrief, previousPrompt, character });
  const layout = buildLayoutDirection({ orientation: orientationKey, userBrief, previousPrompt, character });

  const lines = [
    `Nom du produit : ${name}`,
    price && /prix|price|tarif/i.test(userBrief) ? `Prix (à afficher uniquement parce que l'utilisateur le demande) : ${price}${currency ? ` ${currency}` : ""}` : "",
    description ? `Description :\n${description}` : "Description : non fournie (ne déduis que le thème général du nom, sans rien inventer de précis).",
    productImage ? `Référence visuelle du produit (URL transmise au modèle image en aval; cette URL n'a pas été analysée visuellement par toi) : ${productImage}. Demande au modèle image de préserver seulement l'identité visuelle, la marque et les couleurs du produit réellement visibles, sans copier par défaut la composition, la personne ou les motifs promotionnels de l'affiche de référence (sauf demande explicite de l'utilisateur de reprendre ce style ou cette composition); ne pas contredire les informations produit explicites.` : "",
    `Format de l'image : ${ORIENTATION_LABELS[locale][orientationKey]}`,
    background === "transparent" ? "Fond : transparent (sujet détouré, sans décor)." : "",
    userBrief ? `Consignes personnelles de l'utilisateur à intégrer :\n${userBrief}` : "",
    previousPrompt ? `Prompt précédent (à ne pas reproduire : change de structure, de palette, de style et de personne) :\n${previousPrompt}` : "",
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
