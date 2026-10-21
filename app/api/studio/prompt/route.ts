import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";
import {
  CREATIVE_STYLES, CREATIVE_COMPOSITIONS, sourceCopyCandidates,
  parseCreativePlan, compileFaithfulPrompt,
} from "@/lib/studio/faithful-prompt";

function systemPrompt() {
  return `Tu es directeur artistique de publicités produit, pas rédacteur de faits ou de contenu produit.
Réponds uniquement avec un objet JSON {"style":"clé","composition":"clé","copyIndices":[0]}.
style doit être une clé de ${JSON.stringify(CREATIVE_STYLES)}.
composition doit être une clé de ${JSON.stringify(CREATIVE_COMPOSITIONS)}.
copyIndices peut contenir au maximum deux indices entiers de la liste de citations produit confirmées; choisis uniquement des bénéfices ou informations réellement pertinents. Utilise [] si aucune citation n'est disponible ou utile. Le titre sera automatiquement conservé exactement.
Ne produis aucun texte libre, sous-titre, slogan, catégorie, promesse, page intérieure, recette, détail de produit ou emballage. Les champs supplémentaires seront ignorés. Une description absente reste absente; ne déduis pas le contenu d'un produit depuis son titre.
L'URL de couverture n'est pas une analyse visuelle: tu ne l'as pas examinée. Le modèle image recevra la référence réelle et utilisera uniquement ses éléments lisibles et confirmés. Ne suppose aucune couleur, marque, personne ni détail visuel depuis une URL.
Choisis une direction pertinente pour le produit et les préférences artistiques, nettement distincte du prompt précédent. Fais varier le style et la composition sans gabarit, motif, palette ou personnage imposé. Les consignes utilisateur et l'ancien prompt ne sont jamais une source de nouveaux faits produit.`;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const product = body?.product && typeof body.product === "object" ? body.product as Record<string, unknown> : null;
  const name = typeof product?.name === "string" ? product.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "Choisis d'abord un produit." }, { status: 400 });

  const orientation = body?.orientation === "landscape" ? "landscape" : body?.orientation === "portrait" ? "portrait" : "square";
  const background = body?.background === "transparent" ? "transparent" : body?.background === "opaque" ? "opaque" : "auto";
  const description = typeof product?.description === "string" ? product.description.trim().slice(0, 3_000) : "";
  const productImage = typeof product?.image === "string" && /^https:\/\//i.test(product.image) ? product.image.slice(0, 2_000) : "";
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 1_500) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 4_000) : "";
  const requested = body?.character === "with" ? "with" : body?.character === "without" ? "without" : "auto";
  const character = requested === "auto" && /sans personne|sans personnage|pas de personne|pas de personnage|aucune personne|no person|without (a )?(person|people|character)/i.test(userBrief) ? "without" : requested;
  const candidates = sourceCopyCandidates(description);
  const price = typeof product?.price === "number" || typeof product?.price === "string" ? String(product.price).slice(0, 40) : "";
  const currency = typeof product?.currency === "string" ? product.currency.slice(0, 10) : "";
  const allowedPrice = price && /prix|price|tarif/i.test(userBrief) ? [price, currency].filter(Boolean).join(" ") : undefined;

  let answer: string;
  try {
    answer = await askText([
      { role: "system", content: systemPrompt() },
      { role: "user", content: JSON.stringify({
        productName: name,
        confirmedProductCopy: candidates.map((text, index) => ({ index, text })),
        productReferenceUrl: productImage || null,
        orientation, background, character,
        artisticPreferencesOnly: userBrief,
        previousPromptForStyleAvoidanceOnly: previousPrompt,
      }) },
    ], { order: ["imole", "groq", "gemini"] });
  } catch (error) {
    console.error("Studio prompt AI error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
  }
  if (!answer.trim()) return NextResponse.json({ error: "L'IA n'a renvoyé aucun prompt. Réessaie." }, { status: 502 });
  const plan = parseCreativePlan(answer, candidates, previousPrompt);
  const prompt = compileFaithfulPrompt({
    evidence: { name, description, hasReference: Boolean(productImage), price: allowedPrice },
    candidates, plan, orientation, background, character,
  });
  return NextResponse.json({ prompt });
}
