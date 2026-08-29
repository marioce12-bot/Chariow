import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldReplaceTouch, TOUCH_RETENTION_DAYS } from "@/lib/attribution-selection";

const MAX = { slug: 120, visitor: 128, utm: 255, url: 2048 };
const buckets = new Map<string, { count: number; expiresAt: number }>();

function text(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  return value.trim() || null;
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function limited(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const storeSlug = text(body?.store_slug, MAX.slug);
  const productSlug = text(body?.product_slug, MAX.slug);
  const visitorId = text(body?.visitor_id, MAX.visitor);
  const fields = {
    utm_source: text(body?.utm_source, MAX.utm),
    utm_medium: text(body?.utm_medium, MAX.utm),
    utm_campaign: text(body?.utm_campaign, MAX.utm),
    utm_term: text(body?.utm_term, MAX.utm),
    utm_content: text(body?.utm_content, MAX.utm),
    fbclid: text(body?.fbclid, MAX.utm),
    landing_url: text(body?.landing_url, MAX.url),
  };
  if (storeSlug === undefined || productSlug === undefined || visitorId === undefined || Object.values(fields).some((value) => value === undefined)) return NextResponse.json({ error: "Données d’attribution invalides" }, { status: 400 });
  if (!storeSlug || !visitorId) return NextResponse.json({ error: "store_slug et visitor_id sont requis" }, { status: 400 });
  const ip = clientIp(request);
  if (limited(`${ip}:${storeSlug}`)) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  const supabase = createAdminClient();
  const { data: store } = await supabase.from("stores").select("id,user_id").eq("slug", storeSlug).eq("is_active", true).eq("platform", "chariow").maybeSingle();
  if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  const now = new Date();
  const { data: existing } = await supabase.from("attribution_touches").select("captured_at,utm_source,utm_medium,expires_at").eq("store_id", store.id).eq("visitor_id", visitorId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
  const incoming = { captured_at: now.toISOString(), utm_source: fields.utm_source, utm_medium: fields.utm_medium, expires_at: new Date(now.getTime() + TOUCH_RETENTION_DAYS * 86400000).toISOString() };
  if (!shouldReplaceTouch(existing, incoming)) return NextResponse.json({ received: true, preserved: true });
  const { error } = await supabase.from("attribution_touches").upsert({ user_id: store.user_id, store_id: store.id, product_slug: productSlug, visitor_id: visitorId, ...fields, captured_at: incoming.captured_at, expires_at: incoming.expires_at }, { onConflict: "store_id,visitor_id" });
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer le suivi" }, { status: 500 });
  return NextResponse.json({ received: true });
}
