import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdWalletTopupPayment } from "@/lib/payments/saspay";

// Recharge directe du solde publicitaire. Le montant envoyé est le montant NET
// crédité ; l'utilisateur paie le brut (2 % de commission Vendeo incluse).
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { amount?: number } | null;
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < 2000) {
    return NextResponse.json({ error: "Le montant minimum de recharge est de 2 000 XOF." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("email,full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createAdWalletTopupPayment(
      amount,
      { email: profile?.email || user.email, name: profile?.full_name || undefined },
      { userId: user.id, amount },
    );
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("SasPay wallet topup error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
