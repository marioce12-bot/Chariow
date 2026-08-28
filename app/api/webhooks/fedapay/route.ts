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
  const userId = event.object?.custom_metadata?.userId;
  const plan = event.object?.custom_metadata?.plan;
  if (!userId || !plan) return NextResponse.json({ error: "Métadonnées de paiement manquantes" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").update({ plan, messages_limit: plan === "pro" ? 1200 : 400, status: "active" }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true });
}
