import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanId, planAmount, planMessagesLimit, computePeriodEnd, type PlanId } from "@/lib/plans";

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

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-webhook-signature"), request.headers.get("x-webhook-timestamp"))) return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  const event = JSON.parse(rawBody) as { event?: string; data?: { id?: string; status?: string; amount?: string | number; currency?: string; metadata?: { userId?: string; plan?: PlanId } } };
  if (event.event !== "transaction.success") return NextResponse.json({ received: true });
  const data = event.data;
  const userId = data?.metadata?.userId;
  const plan = data?.metadata?.plan;
  if (!data?.id || !userId || !plan || !isPlanId(plan)) return NextResponse.json({ error: "Métadonnées de paiement manquantes" }, { status: 400 });
  const amount = Number(data.amount);
  if (data.status !== "SUCCESS" || amount !== planAmount(plan) || data.currency !== "XOF") return NextResponse.json({ error: "Transaction SasPay non vérifiée" }, { status: 400 });
  const admin = createAdminClient();
  const { error: eventError } = await admin.from("payment_events").insert({ provider: "saspay", provider_event_id: data.id, transaction_id: data.id, user_id: userId, plan, status: "approved" });
  if (eventError?.code === "23505") return NextResponse.json({ received: true });
  if (eventError) return NextResponse.json({ error: "Événement de paiement non enregistré" }, { status: 500 });
  const now = new Date();
  const periodEnd = computePeriodEnd(plan, now);
  const { error } = await admin.from("subscriptions").update({ plan, messages_limit: planMessagesLimit(plan), status: "active", trial_active: false, messages_used_this_month: 0, current_period_start: now.toISOString().slice(0, 10), current_period_end: periodEnd, updated_at: now.toISOString() }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true });
}
