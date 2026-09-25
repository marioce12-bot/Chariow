import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateFalImage } from "@/lib/ai/fal";

// Génère une affiche publicitaire (fal.ai) pour un produit de la boutique connectée.
// Le client envoie directement les infos produit déjà chargées côté Dashboard
// (nom, description, prix) plutôt que de les re-récupérer ici : ça évite une
// dépendance supplémentaire à un store_id / provider Chariow dans cette route.
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const productName = typeof body?.productName === "string" ? body.productName.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const price = body?.price;
  const currency = typeof body?.currency === "string" ? body.currency : "";
  const format: "square" | "story" | "banner" = body?.format === "story" || body?.format === "banner" ? body.format : "square";
  const extra = typeof body?.extra === "string" ? body.extra.trim() : "";

  if (!productName) {
    return NextResponse.json({ error: "Nom de produit manquant." }, { status: 400 });
  }

  const formatLabel =
    format === "story"
      ? "story verticale (format 9:16)"
      : format === "banner"
      ? "bannière publicitaire horizontale (format 16:9)"
      : "post carré (format 1:1)";
  const priceLine = price ? `Prix affiché : ${price} ${currency || ""}.`.trim() : "";

  const prompt = [
    `Affiche publicitaire professionnelle en ${formatLabel} pour promouvoir le produit "${productName}".`,
    description ? `Description du produit : ${description}.` : "",
    priceLine,
    extra ? `Message à mettre en avant : ${extra}.` : "",
    "Style : design moderne et épuré, couleurs vives et contrastées, typographie percutante avec un titre accrocheur (hook) bien visible, mise en avant du produit, et un appel à l'action clairement lisible. Composition professionnelle prête à être publiée sur les réseaux sociaux. Pas de texte flou ni de fautes.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const imageUrl = await generateFalImage(prompt, format);
    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de la génération de l'affiche.";
    console.error("fal.ai poster generation error", message);
    return NextResponse.json({ error: "Impossible de générer l'affiche pour le moment. Réessaie dans un instant." }, { status: 502 });
  }
}
