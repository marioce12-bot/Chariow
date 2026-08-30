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
  let snapshot;
  try {
    snapshot = await getChariowSnapshot(store);
  } catch (snapshotError) {
    const message = snapshotError instanceof Error ? snapshotError.message : String(snapshotError);
    console.error("Ad campaign product lookup failed", { userId: user.id, storeId: store.id, message });
    return NextResponse.json({ error: "Impossible de vérifier le produit dans Chariow" }, { status: 502 });
  }
  const productSource = snapshot.products;
  const productRecord = productSource && typeof productSource === "object" && !Array.isArray(productSource)
    ? productSource as Record<string, unknown>
    : null;
  const productRows = Array.isArray(productSource)
    ? productSource
    : Array.isArray(productRecord?.data)
      ? productRecord.data
      : Array.isArray(productRecord?.items)
        ? productRecord.items
        : Array.isArray(productRecord?.products)
          ? productRecord.products
          : [];
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const requestedId = normalize(body.product_id);
  const requestedName = normalize(body.product_name);
  const productExists = productRows.some((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const ids = [row.id, row.uuid, row.product_id, row.productId, row.slug].filter(Boolean).map(normalize);
    const name = normalize(row.name ?? row.title);
    return ids.includes(requestedId) || (requestedName.length > 0 && name === requestedName);
  });
  if (!productExists) {
    console.error("Campaign product mismatch", { userId: user.id, storeId: store.id, requestedProductId: body.product_id, requestedProductName: body.product_name, availableProducts: productRows.slice(0, 20).map((item) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: row.id, uuid: row.uuid, product_id: row.product_id, slug: row.slug, name: row.name, title: row.title }; }) });
    return NextResponse.json({ error: "Produit introuvable dans ta boutique" }, { status: 404 });
  }

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
  if (error) {
    console.error("Ad campaign insert failed", { userId: user.id, storeId: store.id, productId: body.product_id, code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "Impossible d’enregistrer la campagne", code: process.env.NODE_ENV === "development" ? error.code : undefined }, { status: 500 });
  }
  return NextResponse.json({ campaign: data }, { status: 201 });
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("ad_campaigns").select("id,product_id,platform,status,objective,title,destination_url,countries,min_age,max_age,daily_budget,duration_days,estimated_budget,external_campaign_id,external_error,meta_ad_account_id,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}
