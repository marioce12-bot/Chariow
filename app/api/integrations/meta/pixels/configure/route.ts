import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Marque (ou démarque) un pixel comme installé sur le parcours de vente Chariow.
// Une fois marqué, le bandeau "aucune conversion" disparaît côté client.
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.account_id === "string" ? body.account_id : "";
  const pixelId = typeof body?.pixel_id === "string" ? body.pixel_id : "";
  const configured = Boolean(body?.configured);
  if (!accountId || !pixelId) return NextResponse.json({ error: "Compte ou pixel manquant" }, { status: 400 });

  const { data, error } = await supabase
    .from("meta_pixels")
    .update({ configured_on_chariow: configured })
    .eq("ad_account_id", accountId)
    .eq("pixel_id", pixelId)
    .eq("user_id", user.id)
    .select("pixel_id,configured_on_chariow")
    .single();
  if (error) return NextResponse.json({ error: "Impossible de mettre à jour le pixel" }, { status: 500 });
  return NextResponse.json({ pixel: data });
}
