import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const objectives = new Set(["sales", "traffic", "engagement", "leads"]);

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.product_id !== "string" || typeof body.text !== "string" || typeof body.link !== "string") {
    return NextResponse.json({ error: "Informations de campagne incomplètes" }, { status: 400 });
  }
  if (!objectives.has(body.objective) || !["meta", "tiktok"].includes(body.platform)) {
    return NextResponse.json({ error: "Configuration publicitaire non prise en charge" }, { status: 400 });
  }
  const dailyBudget = Number(body.daily_budget);
  const durationDays = Number(body.duration_days);
  if (!Number.isFinite(dailyBudget) || dailyBudget < 100 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) {
    return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
  }

  const { data: store } = await supabase.from("stores").select("id,mcp_url,access_token_encrypted").eq("user_id", user.id).eq("connection_status", "connected").limit(1).maybeSingle();
  if (!store) return NextResponse.json({ error: "Connecte d’abord une boutique Chariow" }, { status: 400 });

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
  if (body.platform === "tiktok" && typeof body.tiktok_ad_account_id === "string" && body.tiktok_ad_account_id) {
    const { data: account } = await supabase.from("tiktok_ad_accounts").select("id").eq("id", body.tiktok_ad_account_id).eq("user_id", user.id).maybeSingle();
    if (account) tiktokAdAccountId = account.id;
  }

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
    countries: typeof body.countries === "string" ? body.countries.split(",").map((country: string) => country.trim()).filter(Boolean) : [],
    min_age: Number(body.minAge) || 18,
    max_age: Number(body.maxAge) || 65,
    daily_budget: dailyBudget,
    duration_days: durationDays,
    estimated_budget: dailyBudget * durationDays,
    meta_ad_account_id: metaAdAccountId,
    meta_page_id: body.platform === "meta" && typeof body.meta_page_id === "string" ? body.meta_page_id.trim() || null : null,
    tiktok_ad_account_id: tiktokAdAccountId,
  }).select("id,status").single();
  if (error) {
    console.error("Ad campaign insert failed", { userId: user.id, storeId: store.id, productId: body.product_id, code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "Impossible d’enregistrer la campagne", code: process.env.NODE_ENV === "development" ? error.code : undefined }, { status: 500 });
  }
  return NextResponse.json({ campaign: data }, { status: 201 });
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("ad_campaigns").select("id,product_id,product_name,platform,status,objective,ad_set_name,ad_name,title,ad_text,media_url,destination_url,countries,min_age,max_age,daily_budget,duration_days,estimated_budget,external_campaign_id,external_error,meta_ad_account_id,tiktok_ad_account_id,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function DELETE(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Campagne requise" }, { status: 400 });
  const { error } = await supabase.from("ad_campaigns").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Impossible de supprimer la campagne" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
