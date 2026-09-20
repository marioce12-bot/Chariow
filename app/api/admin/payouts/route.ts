import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const endpoint = "https://api.saspay.me/api/v1";

async function saspayPayout(body: Record<string, unknown>, key: string) {
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) throw new Error("SASPAY_API_KEY is not configured");
  const response = await fetch(`${endpoint}/payouts/initialize/`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SasPay ${response.status}: ${JSON.stringify(data)}`);
  return data as { id?: string; status?: string; message?: string };
}

export async function GET() {
  const { supabase, admin, response } = await requireAdmin(["super_admin"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const service = createAdminClient();
  const { data, error } = await service.from("platform_payouts").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payouts: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, admin, response } = await requireAdmin(["super_admin"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès super administrateur requis" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const amount = Number(body?.amount_xof);
  const name = typeof body?.recipient_name === "string" ? body.recipient_name.trim() : "";
  const phone = typeof body?.recipient_phone === "string" ? body.recipient_phone.trim() : "";
  const country = typeof body?.recipient_country === "string" ? body.recipient_country.trim().toUpperCase() : "BJ";
  const method = typeof body?.recipient_method === "string" ? body.recipient_method.trim() : "";
  if (!Number.isFinite(amount) || amount < 1000 || !name || !phone || !method) return NextResponse.json({ error: "Montant minimum 1 000 XOF, bénéficiaire, téléphone et réseau requis." }, { status: 400 });
  const idempotencyKey = crypto.randomUUID();
  const service = createAdminClient();
  const requestedBy = admin.id === "password-admin" ? null : admin.id;
  const payoutPayload = { requested_by: requestedBy, idempotency_key: idempotencyKey, amount_xof: amount, net_amount_xof: amount, recipient_name: name, recipient_phone: phone, recipient_country: country, recipient_method: method, status: "processing" };
  const { data: payout, error: insertError } = await service.from("platform_payouts").insert(payoutPayload).select().single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  try {
    const result = await saspayPayout({ amount: amount.toFixed(2), currency: "XOF", country, customer: { first_name: name, phone }, method, recipient: { msisdn: phone }, description: "Vendeo - Décaissement plateforme", metadata: { payout_id: payout.id } }, idempotencyKey);
    const { data: updated, error } = await service.from("platform_payouts").update({ provider_payout_id: result.id ?? null, status: result.status?.toLowerCase() === "completed" ? "completed" : "processing", metadata: result }).eq("id", payout.id).select().single();
    if (error) throw error;
    if (admin.id !== "password-admin") await writeAdminAudit(supabase, admin.id, "platform_payout_initialized", "platform_payout", payout.id, { amount_xof: amount, provider_payout_id: result.id });
    return NextResponse.json({ payout: updated }, { status: 201 });
  } catch (error) {
    await service.from("platform_payouts").update({ status: "failed", failure_reason: error instanceof Error ? error.message : "Erreur SasPay" }).eq("id", payout.id);
    return NextResponse.json({ error: "Le décaissement SasPay a échoué.", details: error instanceof Error ? error.message : undefined }, { status: 502 });
  }
}
