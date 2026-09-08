import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPayment, type PaidPlan } from "@/lib/payments/saspay";

export async function POST(_request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  // Un seul abonnement possible : "starter" (Vendeo, 2 000 XOF/mois).
  const plan: PaidPlan = "starter";
  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createPayment(plan, { email: profile?.email || user.email, name: profile?.full_name || undefined }, { userId: user.id, plan });
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("SasPay checkout error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
