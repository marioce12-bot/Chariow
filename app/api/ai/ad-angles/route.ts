import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";

function parseAngles(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("["); const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Réponse d’analyse invalide");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length !== 5) throw new Error("Cinq angles sont requis");
  const angles = parsed.map((row: any, index: number) => ({
    id: `angle-${index + 1}`,
    title: typeof row?.title === "string" ? row.title.trim().slice(0, 90) : "",
    rationale: typeof row?.rationale === "string" ? row.rationale.trim().slice(0, 240) : "",
    copy: typeof row?.copy === "string" ? row.copy.trim().slice(0, 600) : "",
    recommended: row?.recommended === true,
  }));
  if (angles.some((row: any) => !row.title || !row.rationale || !row.copy)) throw new Error("Un angle est incomplet");
  const recommended = angles.filter((row: any) => row.recommended);
  if (recommended.length !== 3) {
    for (const row of recommended.slice(3)) row.recommended = false;
    if (recommended.length < 3) for (const row of angles) {
      if (!row.recommended && angles.filter((entry: any) => entry.recommended).length < 3) row.recommended = true;
    }
  }
  return angles;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const productName = typeof body?.productName === "string" ? body.productName.trim().slice(0, 180) : "";
  const productDescription = typeof body?.productDescription === "string" ? body.productDescription.trim().slice(0, 2400) : "";
  const locale = body?.locale === "en" ? "en" : "fr";
  if (!productName) return NextResponse.json({ error: "Sélectionne d'abord un produit." }, { status: 400 });
  const prompt = `Tu es un stratège publicitaire Meta pour des produits numériques. Réponds uniquement par un tableau JSON de cinq objets {"title":"...","rationale":"...","copy":"...","recommended":true|false}. Trois objets exactement doivent être recommandés. Les cinq angles doivent être réellement distincts (ex. problème résolu, bénéfice prouvé, usage, public, méthode), mais n'invente aucun fait, garantie, résultat, prix ou caractéristique. Si la description ne fournit pas de fait, reste prudent et ne complète pas les lacunes. copy est un texte d'annonce court, modifiable, avec appel à l'action. Langue: ${locale === "en" ? "English" : "French"}. Produit: ${productName}. Description: ${productDescription || "Aucune description détaillée fournie."}.`;
  try {
    const answer = await askText([{ role: "user", content: prompt }]);
    return NextResponse.json({ angles: parseAngles(answer) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("ad angle analysis failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de préparer les angles pour le moment. Réessaie." }, { status: 502 });
  }
}
