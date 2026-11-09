import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";
import { buildMarketRadar, type MarketRadarFormat, type MarketRadarInput, type MarketRadarProductContext } from "@/lib/market-radar";

const FORMATS: MarketRadarFormat[] = ["ebook", "formation", "template", "abonnement"];
const MAX_IDEA_LENGTH = 180;
const MARKET_RADAR_CREDIT_COST = 5;

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
  return text || null;
}

function readProduct(value: unknown): MarketRadarProductContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = value as Record<string, unknown>;
  const name = safeText(product.name, 120);
  if (!name) return null;
  return {
    name,
    description: safeText(product.description, 800),
    category: safeText(product.category, 100),
    type: safeText(product.type, 100),
    price: safeText(product.price, 40),
    currency: safeText(product.currency, 10),
  };
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const product = readProduct(body.product);
  let idea = safeText(body.idea, MAX_IDEA_LENGTH) ?? "";
  if (idea.length < 2 && product) idea = product.name;
  if (idea.length < (product ? 2 : 8)) {
    return NextResponse.json({ error: product ? "Choisis un produit ou précise son idée." : "Décris une idée avec au moins 8 caractères." }, { status: 400 });
  }
  if (typeof body.idea === "string" && body.idea.trim().length > MAX_IDEA_LENGTH) {
    return NextResponse.json({ error: `L’idée doit faire au maximum ${MAX_IDEA_LENGTH} caractères.` }, { status: 400 });
  }

  const format = typeof body.format === "string" && FORMATS.includes(body.format as MarketRadarFormat)
    ? body.format as MarketRadarFormat
    : "ebook";
  const locale = body.locale === "en" ? "en" : "fr";
  const input: MarketRadarInput = { idea, product, format, locale };

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let reservation: { data: unknown; error: unknown };
  try {
    reservation = await admin.rpc("reserve_credits", {
      target_user_id: user.id,
      amount: MARKET_RADAR_CREDIT_COST,
      operation_name: "market_radar",
      model_name: "market-radar",
      provider_amount: 0,
      request_id: requestId,
    });
  } catch {
    return NextResponse.json({ error: "Impossible de vérifier le solde Radar pour le moment." }, { status: 503 });
  }
  if (reservation.error) {
    return NextResponse.json({ error: "Impossible de vérifier le solde Radar pour le moment." }, { status: 503 });
  }

  const reserveResult = reservation.data as { ok?: boolean; balance?: number; reserved?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) {
    const balance = Math.max(0, Math.floor(Number(reserveResult?.balance ?? 0) - Number(reserveResult?.reserved ?? 0)));
    return NextResponse.json({
      error: "Solde insuffisant pour lancer l’analyse Radar.",
      code: "INSUFFICIENT_CREDITS",
      required: MARKET_RADAR_CREDIT_COST,
      balance,
    }, { status: 402 });
  }
  if (!reserveResult.transaction_id) {
    return NextResponse.json({ error: "La réservation des crédits Radar n’a pas pu être confirmée." }, { status: 503 });
  }

  const creditContext = { userId: user.id, amount: MARKET_RADAR_CREDIT_COST };
  try {
    const report = await buildMarketRadar(input, supabase, user.id);
    if (report.status === "ai_unavailable") {
      const refunded = await confirmCreditTransition(admin, "refund_credit_debit", reserveResult.transaction_id, creditContext);
      if (!refunded) return NextResponse.json({ error: "L’analyse n’a pas abouti; la restitution des crédits est en cours de vérification." }, { status: 503 });
      return NextResponse.json({ report, creditsCharged: 0 });
    }

    const charged = await confirmCreditTransition(admin, "complete_credit_debit", reserveResult.transaction_id, creditContext);
    if (!charged) {
      await confirmCreditTransition(admin, "refund_credit_debit", reserveResult.transaction_id, creditContext);
      return NextResponse.json({ error: "Le débit Radar n’a pas pu être confirmé. Réessaie dans un instant." }, { status: 503 });
    }
    return NextResponse.json({ report, creditsCharged: MARKET_RADAR_CREDIT_COST });
  } catch {
    const refunded = await confirmCreditTransition(admin, "refund_credit_debit", reserveResult.transaction_id, creditContext);
    return NextResponse.json({
      error: refunded ? "L’analyse Radar n’a pas abouti. Réessaie dans un instant." : "L’analyse a échoué; la restitution des crédits est en cours de vérification.",
    }, { status: refunded ? 502 : 503 });
  }
}
