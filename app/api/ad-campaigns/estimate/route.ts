import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaDeliveryEstimate } from "@/lib/meta/estimate";
import type { MetaGeoTargeting } from "@/lib/meta/campaigns";

// Coût pour mille impressions (CPM) indicatif, en dollars US. Utilisé UNIQUEMENT
// pour TikTok/Pinterest, ou en repli si l'API Meta est indisponible : pour Meta,
// l'estimation vient de l'endpoint delivery_estimate (voir lib/meta/estimate.ts).
const CPM_RANGE_USD: Record<string, [number, number]> = {
  default: [1, 4],
};

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
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

  // --- Meta : vraie estimation via l'API Marketing (delivery_estimate) ---
  let metaError: string | null = null;
  const metaAccountRowId = typeof body?.meta_ad_account_id === "string" ? body.meta_ad_account_id : null;
  if (body?.platform === "meta" && metaAccountRowId) {
    try {
      const { data: account } = await supabase
        .from("meta_ad_accounts")
        .select("meta_account_id,access_token_encrypted")
        .eq("user_id", user.id)
        .eq("id", metaAccountRowId)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Compte publicitaire Meta introuvable");

      const rawGeo = (body.geo_targeting ?? {}) as Partial<MetaGeoTargeting>;
      const countries = Array.isArray(rawGeo.countries) && rawGeo.countries.length
        ? rawGeo.countries.map(String)
        : Array.isArray(body.countries) ? (body.countries as unknown[]).map(String) : ["BJ"];
      const geoTargeting: MetaGeoTargeting = {
        countries,
        regions: Array.isArray(rawGeo.regions) ? rawGeo.regions : [],
        cities: Array.isArray(rawGeo.cities) ? rawGeo.cities : [],
      };
      const minAge = Number(body.min_age);
      const maxAge = Number(body.max_age);

      const meta = await fetchMetaDeliveryEstimate({
        accountId: `act_${String(account.meta_account_id).replace(/^act_/, "")}`,
        accessToken: decryptSecret(account.access_token_encrypted),
        geoTargeting,
        minAge: Number.isFinite(minAge) && minAge >= 13 ? minAge : 18,
        maxAge: Number.isFinite(maxAge) && maxAge <= 65 ? maxAge : 65,
      });

      return NextResponse.json({
        estimate: {
          source: "meta",
          audienceMin: meta.audienceMin,
          audienceMax: meta.audienceMax,
          dailyReach: meta.dailyReach,
          // Champs du modèle local non utilisés pour Meta (aucune donnée inventée).
          reachMin: 0,
          reachMax: 0,
          impressionsMin: 0,
          impressionsMax: 0,
          totalBudget,
        },
      });
    } catch (e) {
      // On ne bloque pas le wizard : repli sur l'estimation indicative, clairement
      // signalée comme telle à l'utilisateur (source: "model" + metaError).
      metaError = e instanceof Error ? e.message : "Estimation Meta indisponible";
    }
  }

  // --- Repli / TikTok / Pinterest : estimation indicative locale ---
  const [cpmLow, cpmHigh] = CPM_RANGE_USD.default;
  const impressionsMin = Math.round((totalBudget / cpmHigh) * 1000);
  const impressionsMax = Math.round((totalBudget / cpmLow) * 1000);
  // Fréquence moyenne indicative de 1.6 vue/personne sur une campagne courte.
  const reachMin = Math.round(impressionsMin / 1.6);
  const reachMax = Math.round(impressionsMax / 1.6);

  return NextResponse.json({
    estimate: {
      source: "model",
      metaError,
      reachMin,
      reachMax,
      impressionsMin,
      impressionsMax,
      totalBudget,
    },
  });
}
