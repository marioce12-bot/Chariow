import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanId, planAmount, computePeriodEnd, type PlanId } from "@/lib/plans";
import { creditPrice } from "@/lib/studio/credits";
import { notifyAdmin } from "@/lib/email";

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
    metadata?: { userId?: string; plan?: PlanId; type?: string; credits?: number };
  };
};

function eventContext(event: SasPayEvent) {
  return {
    provider: "saspay",
    event: event.event ?? null,
    transaction_id: event.data?.id ?? null,
    status: event.data?.status ?? null,
    currency: event.data?.currency ?? null,
  };
}

function paymentMetadata(expectedXof: number, providerAmount: string | number | undefined, providerCurrency: string | undefined) {
  return {
    provider: "saspay",
    amount_xof: expectedXof,
    provider_amount: providerAmount ?? null,
    provider_currency: providerCurrency ?? null,
  };
}

async function recordFailure(admin: ReturnType<typeof createAdminClient>, event: SasPayEvent, reason: string) {
  const context = { ...eventContext(event), reason };
  console.warn("[saspay-webhook] payment_not_processed", context);
  try {
    const { error } = await admin.rpc("record_webhook_failure", {
      p_provider: "saspay",
      p_event: event.event ?? null,
      p_transaction_id: event.data?.id ?? null,
      p_reason: reason,
      p_payload: event,
    });
    if (error) {
      console.error("[saspay-webhook] failure_persistence_failed", { ...context, code: error.code ?? null });
      return false;
    }
    console.info("[saspay-webhook] failure_recorded", context);
    return true;
  } catch (error) {
    console.error("[saspay-webhook] failure_persistence_threw", {
      ...context,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-webhook-signature"), request.headers.get("x-webhook-timestamp"))) {
    console.warn("[saspay-webhook] invalid_signature");
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  let event: SasPayEvent;
  try {
    event = JSON.parse(rawBody) as SasPayEvent;
  } catch {
    console.error("[saspay-webhook] invalid_json");
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  if (event.event !== "transaction.success") {
    console.info("[saspay-webhook] event_ignored", { event: event.event ?? null });
    return NextResponse.json({ received: true });
  }
  const data = event.data;
  const admin = createAdminClient();
  console.info("[saspay-webhook] success_event_received", eventContext(event));

  if (!data?.id) {
    const recorded = await recordFailure(admin, event, "missing_transaction_id");
    return NextResponse.json({ error: "Transaction invalide" }, { status: recorded ? 400 : 500 });
  }

  if (data.metadata?.type === "studio_credits") {
    const userId = data.metadata.userId;
    const credits = Number(data.metadata.credits);
    if (!userId || !Number.isInteger(credits) || credits < 200) {
      const recorded = await recordFailure(admin, event, "credit_metadata_invalid");
      return NextResponse.json({ error: "Métadonnées de crédits manquantes" }, { status: recorded ? 400 : 500 });
    }
    if (data.status !== "SUCCESS") {
      const recorded = await recordFailure(admin, event, "credit_payment_validation_failed");
      return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: recorded ? 400 : 500 });
    }
    const expectedXof = creditPrice(credits);
    if (data.currency === "XOF" && Number(data.amount) !== expectedXof) {
      console.warn("[saspay-webhook] provider_amount_differs_from_credit_price", { ...eventContext(event), expected_xof: expectedXof, provider_amount: data.amount ?? null });
    }
    const result = await admin.rpc("add_credits", { target_user_id: userId, amount: credits, payment_id: data.id, metadata_value: paymentMetadata(expectedXof, data.amount, data.currency) });
    if (result.error) {
      const recorded = await recordFailure(admin, event, "credit_application_failed");
      return NextResponse.json({ error: "Crédits non ajoutés" }, { status: recorded ? 500 : 503 });
    }
    await admin.rpc("write_platform_audit", { target_user_id: userId, action_name: "studio_credits_purchased", resource_name: "credit_account", resource_key: userId, metadata_value: { transaction_id: data.id, credits, amount_xof: expectedXof, provider_amount: data.amount ?? null, provider_currency: data.currency ?? null } });
    console.info("[saspay-webhook] credit_payment_processed", { ...eventContext(event), user_id: userId, credits });
    return NextResponse.json({ received: true });
  }

  const userId = data.metadata?.userId;
  const plan = data.metadata?.plan;
  if (!userId || !plan || !isPlanId(plan)) {
    const recorded = await recordFailure(admin, event, "subscription_metadata_invalid");
    return NextResponse.json({ error: "Métadonnées de paiement manquantes" }, { status: recorded ? 400 : 500 });
  }
  if (data.status !== "SUCCESS") {
    const recorded = await recordFailure(admin, event, "subscription_payment_validation_failed");
    return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: recorded ? 400 : 500 });
  }
  const expectedXof = planAmount(plan);
  if (data.currency === "XOF" && Number(data.amount) !== expectedXof) {
    console.warn("[saspay-webhook] provider_amount_differs_from_plan_price", { ...eventContext(event), expected_xof: expectedXof, provider_amount: data.amount ?? null });
  }
  const { data: existingEvent, error: lookupError } = await admin.from("payment_events").select("id").eq("provider", "saspay").eq("provider_event_id", data.id).maybeSingle();
  if (lookupError) {
    const recorded = await recordFailure(admin, event, "payment_event_lookup_failed");
    return NextResponse.json({ error: "Événement de paiement non vérifié" }, { status: recorded ? 500 : 503 });
  }
  if (existingEvent) {
    console.info("[saspay-webhook] duplicate_subscription_payment", { ...eventContext(event), user_id: userId });
    return NextResponse.json({ received: true });
  }
  const now = new Date();
  const periodEnd = computePeriodEnd(plan, now);
  const { error } = await admin.from("subscriptions").upsert({ user_id: userId, plan, status: "active", trial_active: false, messages_used_this_month: 0, current_period_start: now.toISOString().slice(0, 10), current_period_end: periodEnd, updated_at: now.toISOString() }, { onConflict: "user_id" });
  if (error) {
    const recorded = await recordFailure(admin, event, "subscription_activation_failed");
    return NextResponse.json({ error: "Abonnement non activé" }, { status: recorded ? 500 : 503 });
  }
  const { error: eventError } = await admin.from("payment_events").insert({ provider: "saspay", provider_event_id: data.id, transaction_id: data.id, user_id: userId, plan, status: "approved", metadata: paymentMetadata(expectedXof, data.amount, data.currency) });
  if (eventError?.code === "23505") {
    console.info("[saspay-webhook] duplicate_subscription_payment", { ...eventContext(event), user_id: userId });
    return NextResponse.json({ received: true });
  }
  if (eventError) {
    const recorded = await recordFailure(admin, event, "payment_event_insert_failed");
    return NextResponse.json({ error: "Événement de paiement non enregistré" }, { status: recorded ? 500 : 503 });
  }
  await admin.rpc("write_platform_audit", { target_user_id: userId, action_name: "subscription_payment_confirmed", resource_name: "subscription", resource_key: userId, metadata_value: { transaction_id: data.id, plan, amount_xof: expectedXof, provider_amount: data.amount ?? null, provider_currency: data.currency ?? null } });
  const { data: profile } = await admin.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
  await notifyAdmin(
    "Nouvel abonnement Vendeo",
    `<p><strong>${profile?.full_name || "Utilisateur"}</strong> (${profile?.email || userId}) a activé l'abonnement Vendeo (${planLabelForEmail(plan)}) après confirmation de SasPay : ${data.amount ?? "montant non fourni"} ${data.currency ?? "devise non fournie"}.</p>`
  );
  console.info("[saspay-webhook] subscription_payment_processed", { ...eventContext(event), user_id: userId, plan });
  return NextResponse.json({ received: true });
}

function planLabelForEmail(plan: PlanId): string {
  return plan === "starter" ? "3,50 $/mois (équivalent approximatif, paiement en XOF)" : String(plan);
}
