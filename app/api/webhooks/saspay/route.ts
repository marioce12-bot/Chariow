import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditPrice } from "@/lib/studio/credits";
import { isPlanId, planAmount, computePeriodEnd, type PlanId } from "@/lib/plans";
import { notifyAdmin, moneyXOF } from "@/lib/email";

function validSignature(rawBody: string, signature: string | null, timestamp: string | null) {
  const secret = process.env.SASPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isInteger(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

type SasPayEvent = {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    amount?: string | number;
    currency?: string;
    metadata?: { userId?: string; plan?: PlanId; type?: string; campaignId?: string; credits?: number; withdrawalId?: string };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-webhook-signature"), request.headers.get("x-webhook-timestamp"))) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }
  const event = JSON.parse(rawBody) as SasPayEvent;

  // --- Retrait du solde publicitaire (payout) : issue asynchrone du retrait ---
  // Traité avant le filtre "transaction.success" ci-dessous, car l'échec d'un retrait
  // (transaction.failed / transaction.cancelled) doit aussi libérer le montant réservé.
  if (event.data?.metadata?.type === "ad_balance_withdrawal") {
    const withdrawalId = event.data.metadata.withdrawalId;
    if (!withdrawalId) return NextResponse.json({ error: "Métadonnées de retrait manquantes" }, { status: 400 });
    const admin = createAdminClient();
    if (event.event === "transaction.success" && event.data.status === "SUCCESS") {
      const result = await admin.rpc("finalize_ad_withdrawal", { withdrawal_id: withdrawalId, new_status: "completed", payout_id: event.data.id ?? null });
      if (result.error) return NextResponse.json({ error: "Retrait non finalisé" }, { status: 500 });
    } else if (event.event === "transaction.failed" || event.event === "transaction.cancelled") {
      const result = await admin.rpc("finalize_ad_withdrawal", { withdrawal_id: withdrawalId, new_status: "failed", payout_id: event.data.id ?? null, error_text: event.event });
      if (result.error) return NextResponse.json({ error: "Retrait non finalisé" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (event.event !== "transaction.success") return NextResponse.json({ received: true });
  const data = event.data;
  if (!data?.id) return NextResponse.json({ error: "Transaction invalide" }, { status: 400 });

  const admin = createAdminClient();

  if (data.metadata?.type === "studio_credits") {
    const userId = data.metadata.userId;
    const credits = Number(data.metadata.credits);
    if (!userId || !Number.isInteger(credits) || credits < 200) return NextResponse.json({ error: "Métadonnées de crédits manquantes" }, { status: 400 });
    if (data.status !== "SUCCESS" || data.currency !== "XOF" || Number(data.amount) !== creditPrice(credits)) return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: 400 });
    const result = await admin.rpc("add_credits", { target_user_id: userId, amount: credits, payment_id: data.id, metadata_value: { provider: "saspay", amount_xof: Number(data.amount) } });
    if (result.error) return NextResponse.json({ error: "Crédits non ajoutés" }, { status: 500 });
    await admin.rpc("write_platform_audit", { target_user_id: userId, action_name: "studio_credits_purchased", resource_name: "credit_account", resource_key: userId, metadata_value: { transaction_id: data.id, credits, amount_xof: Number(data.amount) } });
    const { data: profile } = await admin.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
    await notifyAdmin(
      "Recharge de crédits Studio",
      `<p><strong>${profile?.full_name || "Utilisateur"}</strong> (${profile?.email || userId}) a rechargé <strong>${credits} crédits</strong> pour ${moneyXOF(Number(data.amount))}.</p>`
    );
    return NextResponse.json({ received: true });
  }

  // --- Paiement de lancement de campagne pub ---
  if (data.metadata?.type === "ad_campaign") {
    const { userId, campaignId } = data.metadata;
    if (!userId || !campaignId) return NextResponse.json({ error: "Métadonnées de campagne manquantes" }, { status: 400 });
    if (data.status !== "SUCCESS" || data.currency !== "XOF") return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: 400 });

    const { error: eventError } = await admin.from("payment_events").insert({ provider: "saspay", provider_event_id: data.id, transaction_id: data.id, user_id: userId, plan: null, status: "approved" });
    if (eventError && eventError.code !== "23505") return NextResponse.json({ error: "Événement de paiement non enregistré" }, { status: 500 });

    const { error } = await admin
      .from("ad_campaigns")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("user_id", userId)
      .eq("status", "pending_payment");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Crédite le solde publicitaire du budget NET (sans les 2 % de commission Vendeo).
    // Idempotent sur l'id de transaction : un renvoi du webhook ne crédite jamais deux fois.
    // En cas d'erreur on répond 500 pour que SasPay renvoie l'event.
    const deposit = await admin.rpc("credit_ad_campaign_deposit", { target_user_id: userId, target_campaign_id: campaignId, payment_id: data.id, gross_amount: Number(data.amount) });
    if (deposit.error) return NextResponse.json({ error: "Solde publicitaire non crédité" }, { status: 500 });
    return NextResponse.json({ received: true });
  }

  // --- Paiement d'abonnement (comportement existant, inchangé) ---
  const userId = data.metadata?.userId;
  const plan = data.metadata?.plan;
  if (!userId || !plan || !isPlanId(plan)) return NextResponse.json({ error: "Métadonnées de paiement manquantes" }, { status: 400 });
  const amount = Number(data.amount);
  if (data.status !== "SUCCESS" || amount !== planAmount(plan) || data.currency !== "XOF") return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: 400 });
  // Le montant est conservé dans metadata pour le calcul des revenus d'abonnements (admin_business_metrics).
  const { error: eventError } = await admin.from("payment_events").insert({ provider: "saspay", provider_event_id: data.id, transaction_id: data.id, user_id: userId, plan, status: "approved", metadata: { provider: "saspay", amount_xof: amount } });
  if (eventError?.code === "23505") return NextResponse.json({ received: true });
  if (eventError) return NextResponse.json({ error: "Événement de paiement non enregistré" }, { status: 500 });
  const now = new Date();
  const periodEnd = computePeriodEnd(plan, now);
  const { error } = await admin.from("subscriptions").update({ plan, status: "active", trial_active: false, messages_used_this_month: 0, current_period_start: now.toISOString().slice(0, 10), current_period_end: periodEnd, updated_at: now.toISOString() }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.rpc("write_platform_audit", { target_user_id: userId, action_name: "subscription_payment_confirmed", resource_name: "subscription", resource_key: userId, metadata_value: { transaction_id: data.id, plan, amount_xof: amount } });
  const { data: profile } = await admin.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
  await notifyAdmin(
    "Nouvel abonnement Vendeo",
    `<p><strong>${profile?.full_name || "Utilisateur"}</strong> (${profile?.email || userId}) a activé l'abonnement Vendeo (${planLabelForEmail(plan)}) pour ${moneyXOF(amount)}.</p>`
  );
  return NextResponse.json({ received: true });
}

function planLabelForEmail(plan: PlanId): string {
  return plan === "starter" ? "2 000 XOF/mois" : String(plan);
}
