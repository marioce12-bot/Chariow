import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveUserMaxStores } from "@/lib/plans";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const requestedStoreId = new URL(request.url).searchParams.get("store_id");
  if (requestedStoreId) {
    const { data: existingStore, error: existingError } = await supabase.from("stores").select("id").eq("id", requestedStoreId).eq("user_id", user.id).eq("platform", "chariow").eq("is_active", true).maybeSingle();
    if (existingError) return NextResponse.json({ error: "Impossible de vérifier ta boutique Chariow." }, { status: 500 });
    if (!existingStore) return NextResponse.json({ error: "Boutique Chariow introuvable" }, { status: 404 });
    return NextResponse.json({ allowed: true, reconnect: true });
  }

  const { count, error: countError } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ error: "Impossible de vérifier ton abonnement." }, { status: 500 });

  // Nombre de boutiques autorisées par le plan actif de l'utilisateur
  // (1 pour Vendeo, 3 pour Vendeo Premium — cf. lib/plans.ts).
  const maxStores = await resolveUserMaxStores(supabase, user.id);
  if ((count ?? 0) >= maxStores) {
    return NextResponse.json({ error: `Ton abonnement autorise ${maxStores} boutique(s). Passe au plan Vendeo Premium (3 000 XOF/mois) pour en connecter jusqu'à 3.`, code: "STORE_LIMIT", maxStores }, { status: 403 });
  }
  return NextResponse.json({ allowed: true });
}
