import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePackInput } from "@/lib/ad-variant-packs";

const payloadFields = ["store_id", "product_id", "product_name", "destination_url", "meta_ad_account_id", "meta_page_id", "dsa_beneficiary", "dsa_payor", "countries", "geo_targeting", "meta_targeting", "advantage_audience", "min_age", "max_age", "daily_budget", "duration_days", "variants"] as const;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function samePayload(existing: Record<string, unknown>, body: Record<string, unknown>): boolean {
  return payloadFields.every((field) => canonical(existing[field]) === canonical(body[field]));
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ error: "Le lancement des Packs est désactivé sur cette préversion. Aucune publicité n’a été envoyée.", code: "PACK_PREVIEW_BLOCKED" }, { status: 403 });
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const invalid = validatePackInput(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data: store, error: storeError } = await supabase.from("stores").select("id").eq("id", body.store_id).eq("user_id", user.id).eq("is_active", true).eq("connection_status", "connected").maybeSingle();
  if (storeError) return NextResponse.json({ error: "Impossible de vérifier la boutique" }, { status: 503 });
  if (!store) return NextResponse.json({ error: "Boutique inaccessible ou non connectée" }, { status: 403 });
  const { data: account, error: accountError } = await supabase.from("meta_ad_accounts").select("id").eq("id", body.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Impossible de vérifier le compte Meta" }, { status: 503 });
  if (!account) return NextResponse.json({ error: "Compte Meta inaccessible" }, { status: 403 });

  // Toutes les mutations Pack utilisent exclusivement le client service_role et restent filtrées par user_id.
  const admin = createAdminClient();
  const existing = await admin.from("ad_variant_packs").select("*").eq("user_id", user.id).eq("client_request_id", body.client_request_id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Impossible de vérifier le Pack existant", code: "PACK_LOOKUP_FAILED" }, { status: 503 });
  if (existing.data) {
    if (!samePayload(existing.data, body)) return NextResponse.json({ error: "Cet identifiant de requête est déjà associé à un autre contenu. Modifie l’identifiant avant d’enregistrer.", code: "PACK_REQUEST_CONFLICT" }, { status: 409 });
    return NextResponse.json({ pack: existing.data }, { status: 200 });
  }

  const allowedPayload = Object.fromEntries(payloadFields.map((field) => [field, body[field]]));
  const { data, error } = await admin.from("ad_variant_packs").insert({ ...allowedPayload, client_request_id: body.client_request_id, user_id: user.id, status: "draft", objective: "sales" }).select("*").maybeSingle();
  if (!error && data) return NextResponse.json({ pack: data }, { status: 201 });
  // Résoudre une course unique par relecture; ne jamais supprimer/remplacer une ligne.
  const raced = await admin.from("ad_variant_packs").select("*").eq("user_id", user.id).eq("client_request_id", body.client_request_id).maybeSingle();
  if (raced.error) return NextResponse.json({ error: "Enregistrement du Pack non confirmé", code: "PACK_SAVE_UNCONFIRMED" }, { status: 503 });
  if (raced.data) {
    if (!samePayload(raced.data, body)) return NextResponse.json({ error: "Cet identifiant de requête est déjà associé à un autre contenu.", code: "PACK_REQUEST_CONFLICT" }, { status: 409 });
    return NextResponse.json({ pack: raced.data }, { status: 200 });
  }
  return NextResponse.json({ error: "Enregistrement du Pack non confirmé", code: "PACK_SAVE_UNCONFIRMED" }, { status: error ? 503 : 500 });
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  let query = supabase.from("ad_variant_packs").select("id,client_request_id,store_id,product_id,product_name,status,objective,daily_budget,duration_days,checkpoints,variants,meta_ad_account_id,external_campaign_id,last_error,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Impossible de lire les Packs" }, { status: 500 });
  return NextResponse.json({ packs: data ?? [] });
}
