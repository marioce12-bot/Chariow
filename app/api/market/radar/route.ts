import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildMarketRadar, type MarketRadarInput } from "@/lib/market-radar";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null) as Partial<MarketRadarInput> | null;
  const input: MarketRadarInput = { idea: typeof body?.idea === "string" ? body.idea.trim() : "", country: typeof body?.country === "string" ? body.country : "BJ", audience: typeof body?.audience === "string" ? body.audience.trim() : "", format: ["ebook", "formation", "template", "abonnement"].includes(body?.format ?? "") ? body!.format as MarketRadarInput["format"] : "ebook" };
  if (input.idea.length < 8) return NextResponse.json({ error: "Décris une idée avec au moins 8 caractères." }, { status: 400 });
  return NextResponse.json({ report: await buildMarketRadar(input, supabase) });
}
