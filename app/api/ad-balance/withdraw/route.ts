import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayout } from "@/lib/payments/saspay";
import { AD_WITHDRAWAL_MIN_XOF, isAdWithdrawalNetwork, normalizeBeninMsisdn } from "@/lib/ad-balance";

// Retrait du solde publicitaire, envoyé immédiatement par SasPay sur le mobile money.
// Ordre volontaire : 1) on RÉSERVE le montant en base (atomique, verrou par utilisateur,
// refuse si une campagne est active), 2) on appelle SasPay, 3) on libère le montant si
// SasPay refuse. Le montant n'est donc jamais retirable deux fois, même en cas de
// double-clic ou de requêtes concurrentes.
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => null)) as { amount?: unknown; network?: unknown; phone?: unknown } | null;
  const amount = Number(body?.amount);
  const network = body?.network;
  const msisdn = normalizeBeninMsisdn(String(body?.phone ?? ""));
  if (!Number.isInteger(amount) || amount < AD_WITHDRAWAL_MIN_XOF) {
    return NextResponse.json({ error: `Le montant minimum de retrait est de ${AD_WITHDRAWAL_MIN_XOF.toLocaleString("fr-FR")} XOF.` }, { status: 400 });
  }
  if (!isAdWithdrawalNetwork(network)) return NextResponse.json({ error: "Choisis un réseau Mobile Money." }, { status: 400 });
  if (!msisdn) return NextResponse.json({ error: "Numéro invalide : saisis un numéro béninois à 10 chiffres (ex. 0197505050)." }, { status: 400 });

  const admin = createAdminClient();
  const reservation = await admin.rpc("reserve_ad_withdrawal", { target_user_id: user.id, amount_value: amount, network_code: network, last4: msisdn.slice(-4) });
  if (reservation.error || !reservation.data) return NextResponse.json({ error: "Impossible de traiter le retrait pour le moment." }, { status: 500 });
  const reserved = reservation.data as { ok: boolean; code?: string; id?: string; withdrawable?: number };
  if (!reserved.ok) {
    if (reserved.code === "active_campaign") return NextResponse.json({ error: "Retrait impossible tant qu'une campagne est active ou en cours de validation." }, { status: 409 });
    if (reserved.code === "insufficient_balance") return NextResponse.json({ error: `Montant supérieur à ton solde retirable (${Number(reserved.withdrawable ?? 0).toLocaleString("fr-FR")} XOF).` }, { status: 409 });
    return NextResponse.json({ error: "Retrait refusé." }, { status: 400 });
  }
  const withdrawalId = reserved.id as string;

  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();

  try {
    const payout = await createPayout({
      amount,
      msisdn,
      network,
      idempotencyKey: withdrawalId,
      customer: { email: profile?.email || user.email || undefined, name: profile?.full_name || undefined },
      metadata: { type: "ad_balance_withdrawal", withdrawalId, userId: user.id },
    });
    await admin.from("ad_wallet_transactions").update({ external_id: payout.id }).eq("id", withdrawalId);
    return NextResponse.json({ status: "pending", id: withdrawalId });
  } catch (error) {
    const status = (error as { status?: number }).status;
    console.error("SasPay ad-balance payout error", error instanceof Error ? error.message : "unknown error");
    // Refus définitif (4xx) : le montant redevient disponible immédiatement.
    if (typeof status === "number" && status >= 400 && status < 500) {
      await admin.rpc("finalize_ad_withdrawal", { withdrawal_id: withdrawalId, new_status: "failed", error_text: `SasPay ${status}` });
      return NextResponse.json({ error: "Le retrait n'a pas pu être lancé pour le moment. Ton solde n'a pas été débité." }, { status: 502 });
    }
    // Résultat incertain (timeout, 5xx) : SasPay a pu créer le retrait. On garde le montant
    // réservé ("pending") et le webhook / la réconciliation tranchera, pour ne jamais payer deux fois.
    return NextResponse.json({ status: "pending", id: withdrawalId, uncertain: true }, { status: 202 });
  }
}
