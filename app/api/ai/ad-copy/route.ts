import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askGemini } from "@/lib/ai/gemini";
import { askImole } from "@/lib/ai/imole";

function cleanAnswer(value: string) {
  return value
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\s*["']|["']\s*$/g, "")
    .trim()
    .slice(0, 800);
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const productName = typeof body?.productName === "string" ? body.productName.trim().slice(0, 180) : "";
  const productDescription = typeof body?.productDescription === "string" ? body.productDescription.trim().slice(0, 1800) : "";
  const price = typeof body?.price === "string" || typeof body?.price === "number" ? String(body.price) : "";
  const currency = typeof body?.currency === "string" ? body.currency.trim().slice(0, 12) : "";
  const platform = typeof body?.platform === "string" ? body.platform : "Meta";
  const objective = typeof body?.objective === "string" ? body.objective : "sales";
  const locale = body?.locale === "en" ? "en" : "fr";

  if (!productName) return NextResponse.json({ error: "Sélectionne d'abord un produit." }, { status: 400 });

  const language = locale === "en" ? "English" : "français";
  const prompt = `Tu es un copywriter publicitaire expert en acquisition pour les créateurs de produits digitaux.
Génère uniquement le texte final d'une publicité, sans titre, sans guillemets, sans commentaire et sans markdown.
Écris en ${language}. Le texte doit être court et naturel (maximum 500 caractères) et respecter cette structure :
1. Une première phrase très accrocheuse (hook) qui arrête le défilement, avec une promesse concrète ou une question forte.
2. Deux ou trois bénéfices orientés résultat, sans inventer de caractéristiques non fournies.
3. Une phrase finale avec un appel à l'action clair.
N'utilise pas de hashtags, de fausses garanties, de chiffres inventés ni de promesses irréalistes.
Plateforme : ${platform}. Objectif : ${objective}.
Produit : ${productName}.
${productDescription ? `Description connue : ${productDescription}.` : "Aucune description détaillée n'est disponible : reste général et ne fabrique pas de détails."}
${price ? `Prix : ${price}${currency ? ` ${currency}` : ""}.` : "Le prix n'est pas fourni : ne l'invente pas."}`;

  try {
    let answer: string;
    try {
      answer = await askImole([{ role: "user", content: prompt }]);
    } catch (imoleError) {
      console.error("Imole ad copy error", imoleError instanceof Error ? imoleError.message : imoleError);
      try {
        answer = await askGemini([{ role: "user", content: prompt }]);
      } catch (geminiError) {
        console.error("Gemini ad copy error", geminiError instanceof Error ? geminiError.message : geminiError);
        throw new Error("Les fournisseurs IA Imole et Gemini sont indisponibles");
      }
    }
    const text = cleanAnswer(answer);
    if (!text) throw new Error("Réponse IA vide");
    return NextResponse.json({ text });
  } catch (error) {
    console.error("ad copy generation error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de générer le texte pour le moment. Réessaie dans quelques instants." }, { status: 502 });
  }
}
