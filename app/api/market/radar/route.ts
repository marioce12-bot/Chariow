import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildMarketRadar, type MarketRadarFormat, type MarketRadarInput, type MarketRadarProductContext } from "@/lib/market-radar";

const FORMATS: MarketRadarFormat[] = ["ebook", "formation", "template", "abonnement"];
const MAX_IDEA_LENGTH = 180;

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
  return NextResponse.json({ report: await buildMarketRadar(input, supabase, user.id) });
}
