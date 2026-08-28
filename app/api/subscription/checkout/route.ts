import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPayment, type PaidPlan } from "@/lib/payments/fedapay";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body?.plan || !["starter", "pro"].includes(body.plan)) return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
  try {
    const payment = await createPayment(body.plan as PaidPlan, { email: profile?.email || user.email, name: profile?.full_name || undefined }, { userId: user.id, plan: body.plan });
    return NextResponse.json({ payment });
  } catch (error) {
    console.error("FedaPay checkout error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
