import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPayment, type PaidPlan } from "@/lib/payments/saspay";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  // Un seul abonnement Vendeo achetable (2 000 XOF/mois) : "pro" et "eco" restent
  // définis dans lib/plans.ts pour compatibilité avec d'éventuels comptes existants,
  // mais ne sont plus proposés à l'achat.
  if (body?.plan !== "starter") return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createPayment(body.plan as PaidPlan, { email: profile?.email || user.email, name: profile?.full_name || undefined }, { userId: user.id, plan: body.plan });
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("SasPay checkout error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
