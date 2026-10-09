import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaDeliveryEstimate } from "@/lib/meta/estimate";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  if (body?.platform !== "meta" || typeof body?.meta_ad_account_id !== "string" || !body.meta_ad_account_id) {
    return NextResponse.json({ error: "L'estimation automatique est disponible pour Meta qu'après connexion d'un compte publicitaire." }, { status: 400 });
  }

  try {
    const { data: account } = await supabase
      .from("meta_ad_accounts")
      .select("meta_account_id,access_token_encrypted")
      .eq("user_id", user.id)
      .eq("id", body.meta_ad_account_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!account) return NextResponse.json({ error: "Compte publicitaire Meta introuvable." }, { status: 404 });

    const rawGeo = body.geo_targeting && typeof body.geo_targeting === "object" ? body.geo_targeting : {};
    const countries = Array.isArray(rawGeo.countries) && rawGeo.countries.length ? rawGeo.countries.map(String) : ["BJ"];
    const geoTargeting = {
      countries,
      regions: Array.isArray(rawGeo.regions) ? rawGeo.regions : [],
      cities: Array.isArray(rawGeo.cities) ? rawGeo.cities : [],
    };
    const minAge = Number(body.min_age);
    const maxAge = Number(body.max_age);
    const estimate = await fetchMetaDeliveryEstimate({
      accountId: `act_${String(account.meta_account_id).replace(/^act_/, "")}`,
      accessToken: decryptSecret(account.access_token_encrypted),
      geoTargeting,
      minAge: Number.isFinite(minAge) && minAge >= 13 ? minAge : 18,
      maxAge: Number.isFinite(maxAge) && maxAge <= 65 ? maxAge : 65,
    });
    return NextResponse.json({ estimate, source: "meta" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Estimation Meta indisponible";
    console.error("Meta delivery estimate error", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
