import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sanitizeGeoTargeting } from "@/lib/ad-campaigns/geo";
import { normalizeMetaCta } from "@/lib/meta/cta";
import { parseCarouselUrls } from "@/lib/meta/carousel";
import { getMetaCampaignLifecycle } from "@/lib/meta/status";
import { linkCampaignMedia } from "@/lib/creative-performance/placements";

const objectives = new Set(["sales", "traffic", "engagement", "leads"]);

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.product_id !== "string" || typeof body.text !== "string" || typeof body.link !== "string") {
    return NextResponse.json({ error: "Informations de campagne incomplètes" }, { status: 400 });
  }
  if (!objectives.has(body.objective) || !["meta", "tiktok", "pinterest"].includes(body.platform)) {
    return NextResponse.json({ error: "Configuration publicitaire non prise en charge" }, { status: 400 });
  }
  const dailyBudget = Number(body.daily_budget);
  const durationDays = Number(body.duration_days);
  // Le budget quotidien est saisi en dollars ($, voir l'étape Budget) : le
  // minimum précédent (100) datait d'une époque où ce champ était en XOF et
  // rejetait donc à tort n'importe quel budget réaliste en dollars (ex: 2$,
  // 5$). Aligné sur le minimum utilisé par le parcours de budget.
  if (!Number.isFinite(dailyBudget) || dailyBudget < 1 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) {
    return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
  }

  let storeQuery = supabase.from("stores").select("id,mcp_url,access_token_encrypted").eq("user_id", user.id).eq("is_active", true).eq("connection_status", "connected");
  const requestedStoreId = body.store_id ?? body.storeId;
  if (typeof requestedStoreId === "string") storeQuery = storeQuery.eq("id", requestedStoreId);
  const { data: store } = await storeQuery.limit(1).maybeSingle();
  if (!store) return NextResponse.json({ error: "Connecte d’abord la boutique sélectionnée" }, { status: 400 });

  // Le compte pub et (pour Meta) la page choisis à l'étape 2 du wizard sont
  // enregistrés dès la création du brouillon — pas seulement au moment du
  // lancement — pour que la campagne puisse être reprise depuis "Mes
  // campagnes" (payer maintenant, envoyer à Meta plus tard) sans perdre ce
  // choix ni repasser par le wizard. Un id de compte qui n'appartient pas à
  // l'utilisateur est silencieusement ignoré (repris par /launch plus tard).
  let metaAdAccountId: string | null = null;
  if (body.platform === "meta" && typeof body.meta_ad_account_id === "string" && body.meta_ad_account_id) {
    const { data: account } = await supabase.from("meta_ad_accounts").select("id").eq("id", body.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (account) metaAdAccountId = account.id;
  }
  let tiktokAdAccountId: string | null = null;
  let pinterestAdAccountId: string | null = null;
  if (body.platform === "tiktok" && typeof body.tiktok_ad_account_id === "string" && body.tiktok_ad_account_id) {
    const { data: account } = await supabase.from("tiktok_ad_accounts").select("id").eq("id", body.tiktok_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (account) tiktokAdAccountId = account.id;
  }

  if (body.platform === "pinterest" && typeof body.pinterest_ad_account_id === "string" && body.pinterest_ad_account_id) {
    const { data: account } = await supabase.from("pinterest_ad_accounts").select("id").eq("id", body.pinterest_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (account) pinterestAdAccountId = account.id;
  }
  // geo_targeting : détail région/ville du widget de recherche d'audience
  // (étape 3). Uniquement exploité par Meta au lancement (voir lib/meta/campaigns.ts) ;
  // `countries` reste dans tous les cas la donnée envoyée à TikTok et le repli
  // de sécurité pour Meta si aucune région/ville précise n'a été choisie.
  const geoTargeting = sanitizeGeoTargeting(body.geo_targeting);
  const carouselUrls = body.platform === "meta" ? parseCarouselUrls(body.carousel_urls, typeof body.media_url === "string" ? body.media_url : null) : [];

  const { data, error } = await supabase.from("ad_campaigns").insert({
    user_id: user.id,
    store_id: store.id,
    product_id: body.product_id,
    product_name: typeof body.product_name === "string" ? body.product_name.trim() : null,
    platform: body.platform,
    status: "draft",
    objective: body.objective,
    // "Ensemble de publicités" / "Publicité" (façon Meta Ads Manager) : simples
    // libellés d'organisation côté Vendeo, pas encore transmis à Meta/TikTok
    // lors du lancement (/api/ad-campaigns/[id]/launch génère ses propres noms).
    ad_set_name: typeof body.ad_set_name === "string" ? body.ad_set_name.trim() || null : null,
    ad_name: typeof body.ad_name === "string" ? body.ad_name.trim() || null : null,
    ad_text: body.text.trim(),
    title: typeof body.title === "string" ? body.title.trim() : null,
    destination_url: body.link.trim(),
    media_url: typeof body.media_url === "string" ? body.media_url.trim() : null,
    // Carrousel : colonne écrite seulement s'il y a des images supplémentaires (publicités à image unique inchangées).
    ...(carouselUrls.length ? { carousel_urls: carouselUrls } : {}),
    countries: typeof body.countries === "string" ? body.countries.split(",").map((country: string) => country.trim()).filter(Boolean) : [],
    geo_targeting: geoTargeting,
    min_age: Number(body.minAge) || 18,
    max_age: Number(body.maxAge) || 65,
    daily_budget: dailyBudget,
    duration_days: durationDays,
    estimated_budget: dailyBudget * durationDays,
    meta_ad_account_id: metaAdAccountId,
    meta_page_id: body.platform === "meta" && typeof body.meta_page_id === "string" ? body.meta_page_id.trim() || null : null,
    call_to_action: body.platform === "meta" ? normalizeMetaCta(body.call_to_action) : null,
    // Advantage+ (Meta) : NULL si non fourni → le lancement applique les valeurs par défaut.
    advantage_creative: body.platform === "meta" && typeof body.advantage_creative === "boolean" ? body.advantage_creative : null,
    advantage_audience: body.platform === "meta" && typeof body.advantage_audience === "boolean" ? body.advantage_audience : null,
    tiktok_ad_account_id: tiktokAdAccountId,
    pinterest_ad_account_id: pinterestAdAccountId,
  }).select("id,status").single();
  if (error) {
    console.error("Ad campaign insert failed", { userId: user.id, storeId: store.id, productId: body.product_id, code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "Impossible d’enregistrer la campagne", code: process.env.NODE_ENV === "development" ? error.code : undefined }, { status: 500 });
  }
  let mediaTracking: { linked: number; mediaCount: number } | null = null;
  try {
    mediaTracking = await linkCampaignMedia(supabase, {
      userId: user.id,
      storeId: store.id,
      campaignId: data.id,
      campaignName: (typeof body.title === "string" && body.title.trim()) || (typeof body.product_name === "string" && body.product_name.trim()) || body.product_id,
      platform: body.platform,
      productId: body.product_id,
      productName: typeof body.product_name === "string" ? body.product_name.trim() || null : null,
      variantLabel: typeof body.variant_label === "string" ? body.variant_label : null,
      mediaUrls: [typeof body.media_url === "string" ? body.media_url : "", ...carouselUrls],
    });
  } catch (trackingError) {
    console.warn("Campaign saved without creative-library links", trackingError instanceof Error ? trackingError.message : "unknown error");
  }
  return NextResponse.json({ campaign: data, mediaTracking }, { status: 201 });
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  let query = supabase.from("ad_campaigns").select("id,product_id,product_name,platform,status,objective,effective_objective,ad_set_name,ad_name,title,ad_text,media_url,carousel_urls,destination_url,countries,geo_targeting,meta_page_id,call_to_action,advantage_creative,advantage_audience,min_age,max_age,daily_budget,duration_days,estimated_budget,external_campaign_id,external_error,meta_ad_account_id,tiktok_ad_account_id,pinterest_ad_account_id,autopilot_enabled,autopilot_paused_at,autopilot_pause_reason,created_at,updated_at").eq("user_id", user.id);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });
  // This endpoint feeds the current-campaign UI, including older tabs/PWA clients
  // which still render a history drawer when terminal rows are present. Exclude
  // those rows from the response only: their records and reporting data stay intact.
  const campaigns = (data ?? []).filter((campaign) => !["archived", "deleted"].includes(
    getMetaCampaignLifecycle(campaign.status, campaign.external_error) ?? "",
  ));
  return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Campagne requise" }, { status: 400 });
  const { data: campaign, error: readError } = await supabase
    .from("ad_campaigns")
    .select("id,external_campaign_id,external_ad_id,title,product_name,product_id,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError || !campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  // Retain the campaign and its reporting history; only hide it from active lists.
  const { error } = await supabase.from("ad_campaigns").update({ status: "deleted" }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Impossible de supprimer la campagne" }, { status: 500 });
  await supabase.from("creative_media_placements").update({
    campaign_name_snapshot: campaign.title || campaign.product_name || campaign.product_id || "Campagne",
    campaign_status_snapshot: "deleted",
    external_campaign_id: campaign.external_campaign_id,
    external_ad_id: campaign.external_ad_id,
  }).eq("user_id", user.id).eq("campaign_key", campaign.id);
  return NextResponse.json({ ok: true });
}
