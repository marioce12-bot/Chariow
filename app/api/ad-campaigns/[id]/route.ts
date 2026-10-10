import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sanitizeGeoTargeting } from "@/lib/ad-campaigns/geo";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim() || null;
  if (typeof body.ad_text === "string" && body.ad_text.trim()) updates.ad_text = body.ad_text.trim();
  if (typeof body.destination_url === "string" && body.destination_url.trim()) updates.destination_url = body.destination_url.trim();
  if (typeof body.media_url === "string") updates.media_url = body.media_url.trim() || null;
  if (Array.isArray(body.countries)) updates.countries = body.countries.filter((country): country is string => typeof country === "string" && country.length > 0);
  if (Number.isInteger(body.min_age) && Number(body.min_age) >= 13) updates.min_age = Number(body.min_age);
  if (Number.isInteger(body.max_age) && Number(body.max_age) >= 13) updates.max_age = Number(body.max_age);
  // Champs supplémentaires envoyés par le wizard en mode « modification » (étapes 1 à 4).
  if (typeof body.product_id === "string" && body.product_id.trim()) updates.product_id = body.product_id.trim();
  if (typeof body.product_name === "string") updates.product_name = body.product_name.trim() || null;
  if (typeof body.ad_set_name === "string") updates.ad_set_name = body.ad_set_name.trim() || null;
  if (typeof body.ad_name === "string") updates.ad_name = body.ad_name.trim() || null;
  if (typeof body.meta_page_id === "string") updates.meta_page_id = body.meta_page_id.trim() || null;
  if ("geo_targeting" in body) updates.geo_targeting = sanitizeGeoTargeting(body.geo_targeting);
  const dailyBudget = Number(body.daily_budget);
  const durationDays = Number(body.duration_days);
  if (body.daily_budget !== undefined || body.duration_days !== undefined) {
    if (!Number.isFinite(dailyBudget) || dailyBudget < 1 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) {
      return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
    }
    updates.daily_budget = dailyBudget;
    updates.duration_days = durationDays;
    updates.estimated_budget = dailyBudget * durationDays;
  }
  // Un compte publicitaire qui n'appartient pas à l'utilisateur est ignoré.
  for (const [field, table] of [["meta_ad_account_id", "meta_ad_accounts"], ["tiktok_ad_account_id", "tiktok_ad_accounts"], ["pinterest_ad_account_id", "pinterest_ad_accounts"]] as const) {
    const value = body[field];
    if (typeof value !== "string" || !value) continue;
    const { data: account } = await supabase.from(table).select("id").eq("id", value).eq("user_id", user.id).maybeSingle();
    if (account) updates[field] = account.id;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Aucune modification" }, { status: 400 });

  // Une campagne déjà diffusée ou en cours d'examen ne se modifie pas ici.
  const { data: current } = await supabase.from("ad_campaigns").select("status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (["submitting", "review", "active"].includes(current.status)) {
    return NextResponse.json({ error: "Cette campagne ne peut plus être modifiée" }, { status: 409 });
  }
  updates.external_error = null;

  const { data, error } = await supabase.from("ad_campaigns").update(updates).eq("id", id).eq("user_id", user.id).select("id,status,external_error").maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de modifier la campagne" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  return NextResponse.json({ campaign: data });
}
