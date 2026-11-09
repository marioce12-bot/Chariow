import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildMarketRadar, type MarketRadarFormat, type MarketRadarInput } from "@/lib/market-radar";

const FORMATS: MarketRadarFormat[] = ["ebook", "formation", "template", "abonnement"];
const MAX_IDEA_LENGTH = 180;
const MAX_AUDIENCES = 5;
const MAX_AUDIENCE_LENGTH = 80;

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (idea.length < 8) return NextResponse.json({ error: "Décris une idée avec au moins 8 caractères." }, { status: 400 });
  if (idea.length > MAX_IDEA_LENGTH) return NextResponse.json({ error: `L’idée doit faire au maximum ${MAX_IDEA_LENGTH} caractères.` }, { status: 400 });

  const rawAudiences = Array.isArray(body.audiences) ? body.audiences : [];
  if (rawAudiences.length > MAX_AUDIENCES) {
    return NextResponse.json({ error: `Choisis au maximum ${MAX_AUDIENCES} audiences.` }, { status: 400 });
  }
  if (rawAudiences.some((value) => typeof value !== "string" || value.trim().length > MAX_AUDIENCE_LENGTH)) {
    return NextResponse.json({ error: "Une audience est invalide ou trop longue." }, { status: 400 });
  }
  const audiences = rawAudiences
    .map((value) => (value as string).trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const audience = typeof body.audience === "string" ? body.audience.trim().slice(0, 360) : audiences.join(", ");
  const format = typeof body.format === "string" && FORMATS.includes(body.format as MarketRadarFormat)
    ? body.format as MarketRadarFormat
    : "ebook";
  const locale = body.locale === "en" ? "en" : "fr";

  const input: MarketRadarInput = { idea, audience, audiences, format, locale };
  return NextResponse.json({ report: await buildMarketRadar(input, supabase) });
}
