import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  try {
    // reset_subscription_period_if_needed() est SECURITY DEFINER et accepte n'importe quel
    // target_user_id : son droit d'exécution est réservé à service_role (migration
    // 20260929120000). On l'appelle donc avec le client admin, et target_user_id vient
    // UNIQUEMENT de l'utilisateur authentifié (requireUser), jamais de la requête.
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reset_subscription_period_if_needed", { target_user_id: user.id });
    if (error) throw error;
    return NextResponse.json({ subscription: data });
  } catch (error) {
    console.error("reset_subscription_period_if_needed failed; using fallback", error);
    const { data, error: selectError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (selectError) {
      console.error("subscriptions fallback select failed", selectError);
      return NextResponse.json({ subscription: null });
    }
    return NextResponse.json({ subscription: data });
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  return NextResponse.json({ error: "Un paiement SasPay est requis pour changer de plan" }, { status: 402 });
}
