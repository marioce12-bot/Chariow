import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.replace(/^sha256=/, "");
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-fedapay-signature"))) return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  const event = JSON.parse(rawBody) as { name?: string; id?: string; object?: { id?: number; status?: string; custom_metadata?: { userId?: string; plan?: "starter" | "pro" } } };
  if (event.name !== "transaction.approved") return NextResponse.json({ received: true });
  if (!event.id || !event.object?.id) return NextResponse.json({ error: "Événement FedaPay invalide" }, { status: 400 });
  const userId = event.object?.custom_metadata?.userId;
  const plan = event.object?.custom_metadata?.plan;
  if (!userId || !plan) return NextResponse.json({ error: "Métadonnées de paiement manquantes" }, { status: 400 });
  const admin = createAdminClient();
  let transaction = null;
  let transactionError: unknown = null;
  try {
    const { getTransaction } = await import("@/lib/payments/fedapay");
    transaction = await getTransaction(event.object.id);
  } catch (error) {
    transactionError = error;
  }
  if (transactionError || transaction?.status !== "approved" || transaction.amount !== (plan === "pro" ? 5000 : 3000) || transaction.currency?.iso !== "XOF") return NextResponse.json({ error: "Transaction FedaPay non vérifiée" }, { status: 400 });
  const { error: eventError } = await admin.from("payment_events").insert({ provider: "fedapay", provider_event_id: event.id, transaction_id: String(event.object.id), user_id: userId, plan, status: "approved" });
  if (eventError?.code === "23505") return NextResponse.json({ received: true });
  if (eventError) return NextResponse.json({ error: "Événement de paiement non enregistré" }, { status: 500 });
  const { error } = await admin.from("subscriptions").update({ plan, messages_limit: plan === "pro" ? 1200 : 400, status: "active", trial_active: false }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true });
}
