import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !Object.hasOwn(body, "variantLabel")) {
    return NextResponse.json({ error: "Indique la variante à enregistrer." }, { status: 400 });
  }
  if (body.variantLabel !== null && (typeof body.variantLabel !== "string" || body.variantLabel.trim().length > 120)) {
    return NextResponse.json({ error: "La variante doit contenir au maximum 120 caractères." }, { status: 400 });
  }
  const { data, error } = await supabase.from("creative_media_placements")
    .update({ variant_label: typeof body.variantLabel === "string" ? body.variantLabel.trim() || null : null })
    .eq("id", id).eq("user_id", user.id)
    .select("id,variant_label").maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer la variante." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lien média-campagne introuvable." }, { status: 404 });
  return NextResponse.json({ placement: data }, { headers: { "Cache-Control": "no-store" } });
}
