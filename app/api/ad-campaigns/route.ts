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
  if (!objectives.has(body.objective) || body.platform !== "meta") {
    return NextResponse.json({ error: "Configuration publicitaire non prise en charge" }, { status: 400 });
  }
  const dailyBudget = Number(body.daily_budget);
  const durationDays = Number(body.duration_days);
  if (!Number.isFinite(dailyBudget) || dailyBudget < 100 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) {
    return NextResponse.json({ error: "Budget ou durée invalide" }, { status: 400 });
  }

  const { data: store } = await supabase.from("stores").select("id,mcp_url,access_token_encrypted").eq("user_id", user.id).eq("connection_status", "connected").limit(1).maybeSingle();
  if (!store) return NextResponse.json({ error: "Connecte d’abord une boutique Chariow" }, { status: 400 });

  // Product catalogues are supplied by Chariow through MCP and are not stored
  // in a `chariow_products` table. Validate the product identifier against the
  // synchronized store snapshot instead of querying a non-existent table.
  const { getChariowSnapshot } = await import("@/lib/chariow/analytics");
  const snapshot = await getChariowSnapshot(store);
  const productExists = snapshot.products.some((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return String(row.id ?? row.product_id ?? "") === body.product_id;
  });
  if (!productExists) return NextResponse.json({ error: "Produit introuvable dans ta boutique" }, { status: 404 });

  const { data, error } = await supabase.from("ad_campaigns").insert({
    user_id: user.id,
    store_id: store.id,
    product_id: body.product_id,
    platform: "meta",
    status: "draft",
    objective: body.objective,
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
  }).select("id,status").single();
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer la campagne" }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("ad_campaigns").select("id,product_id,platform,status,objective,title,destination_url,countries,min_age,max_age,daily_budget,duration_days,estimated_budget,external_campaign_id,external_error,meta_ad_account_id,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}
