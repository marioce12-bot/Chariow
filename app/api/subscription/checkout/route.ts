import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPayment, type PaidPlan } from "@/lib/payments/saspay";
import { isPlanId } from "@/lib/plans";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  // Deux plans possibles : "starter" (Vendeo, 2 000 XOF/mois, 1 boutique) ou
  // "premium" (Vendeo Premium, 3 000 XOF/mois, 3 boutiques). "starter" reste
  // la valeur par défaut si rien n'est fourni, pour ne pas casser les appels
  // existants qui n'envoient pas encore de plan.
  const plan: PaidPlan = isPlanId(body?.plan) ? body.plan : "starter";
  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createPayment(plan, { email: profile?.email || user.email, name: profile?.full_name || undefined }, { userId: user.id, plan });
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("SasPay checkout error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
