import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// Coût pour mille impressions (CPM) indicatif par marché — à ajuster avec des
// données réelles une fois l'historique de campagnes disponible (table ad_metrics).
const CPM_RANGE_XOF: Record<string, [number, number]> = {
  default: [800, 2200],
};

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const dailyBudget = Number(body?.daily_budget);
  const durationDays = Number(body?.duration_days);
  if (!Number.isFinite(dailyBudget) || dailyBudget < 100 || !Number.isFinite(durationDays) || durationDays < 1) {
    return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
  }

  const netAdBudget = dailyBudget * durationDays;
  // 98% du montant brut = budget pub net → brut = net / 0.98
  const grossBudget = Math.round(netAdBudget / 0.98);
  const vendeoCommission = grossBudget - netAdBudget;

  const [cpmLow, cpmHigh] = CPM_RANGE_XOF.default;
  const impressionsMin = Math.round((netAdBudget / cpmHigh) * 1000);
  const impressionsMax = Math.round((netAdBudget / cpmLow) * 1000);
  // Fréquence moyenne indicative de 1.6 vue/personne sur une campagne courte.
  const reachMin = Math.round(impressionsMin / 1.6);
  const reachMax = Math.round(impressionsMax / 1.6);

  return NextResponse.json({
    estimate: {
      reachMin,
      reachMax,
      impressionsMin,
      impressionsMax,
      grossBudget,
      netAdBudget,
      vendeoCommission,
    },
  });
}
