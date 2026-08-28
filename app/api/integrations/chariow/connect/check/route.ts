import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { count, error: countError } = await supabase
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ error: "Impossible de vérifier ton abonnement." }, { status: 500 });

  const { data: subscription } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
  const maxStores = subscription?.plan === "pro" ? 3 : 1;
  if ((count ?? 0) >= maxStores) {
    return NextResponse.json({ error: `Ton plan autorise ${maxStores} boutique(s). Reconnecte une boutique existante ou passe au plan Pro.`, code: "STORE_LIMIT", maxStores }, { status: 403 });
  }
  return NextResponse.json({ allowed: true });
}
