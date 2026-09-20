import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createCreditsPayment } from "@/lib/payments/saspay";
import { creditPrice, MIN_CREDITS } from "@/lib/studio/credits";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const credits = Number(body?.credits);
  if (!Number.isInteger(credits) || credits < MIN_CREDITS) return NextResponse.json({ error: "Le minimum de recharge est de 200 crédits." }, { status: 400 });
  const { data: profile } = await supabase.from("profiles").select("email,full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createCreditsPayment(credits, creditPrice(credits), { email: profile?.email || user.email, name: profile?.full_name || undefined }, { userId: user.id, credits });
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("Credits checkout error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de créer le paiement." }, { status: 502 });
  }
}
