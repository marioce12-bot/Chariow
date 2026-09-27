import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Coût pour mille impressions (CPM) indicatif par marché, en dollars US (devise
// du compte publicitaire Meta) — à ajuster avec des données réelles une fois
// l'historique de campagnes disponible (table ad_metrics).
const CPM_RANGE_USD: Record<string, [number, number]> = {
  default: [1, 4],
};

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const dailyBudget = Number(body?.daily_budget);
  const durationDays = Number(body?.duration_days);
  if (!Number.isFinite(dailyBudget) || dailyBudget < 1 || !Number.isFinite(durationDays) || durationDays < 1) {
    return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
  }

  // Aucune commission Vendeo : tout le budget saisi finance directement la
  // campagne chez Meta/TikTok (le compte pub de l'utilisateur est facturé
  // directement par la plateforme).
  const totalBudget = dailyBudget * durationDays;

  const [cpmLow, cpmHigh] = CPM_RANGE_USD.default;
  const impressionsMin = Math.round((totalBudget / cpmHigh) * 1000);
  const impressionsMax = Math.round((totalBudget / cpmLow) * 1000);
  // Fréquence moyenne indicative de 1.6 vue/personne sur une campagne courte.
  const reachMin = Math.round(impressionsMin / 1.6);
  const reachMax = Math.round(impressionsMax / 1.6);

  return NextResponse.json({
    estimate: {
      reachMin,
      reachMax,
      impressionsMin,
      impressionsMax,
      totalBudget,
    },
  });
}
