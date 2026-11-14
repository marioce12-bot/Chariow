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

type PackRow = {
  id: string;
  meta_ad_account_id?: string | null;
  created_at?: string | null;
  variants?: Array<{ id?: string; angle?: string; format?: string }> | null;
  checkpoints?: { ads?: Array<string | null> | null } | null;
  [key: string]: unknown;
};
type AdInsightRow = { ad_account_id: string; entity_id: string; entity_name?: string | null; impressions?: number | string | null; clicks?: number | string | null; spend?: number | string | null; conversions?: number | string | null; conversion_value?: number | string | null };
type AdAggregate = { name: string; impressions: number; clicks: number; spend: number; purchases: number; purchaseValue: number };
const PAGE_SIZE = 500;
const numberValue = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };
function utcDate(value: unknown, fallback: string) {
  const parsed = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : fallback;
}
function maxDate(a: string, b: string) { return a > b ? a : b; }

async function attachAdResults(supabase: any, userId: string, packs: PackRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
  const idsByPack = new Map(packs.map((pack) => [pack.id, {
    from: maxDate(utcDate(pack.created_at, cutoff), cutoff),
    ads: Array.isArray(pack.checkpoints?.ads) ? pack.checkpoints!.ads! : [],
  }]));
  const accountIds = [...new Set(packs.map((pack) => pack.meta_ad_account_id).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const adIds = [...new Set([...idsByPack.values()].flatMap((item) => item.ads.filter((id): id is string => typeof id === "string" && Boolean(id))))];
  let accounts: Array<{ id: string; currency?: string | null; last_synced_at?: string | null }> = [];
  let unavailable = false;
  if (accountIds.length) {
    const result = await supabase.from("meta_ad_accounts").select("id,currency,last_synced_at").eq("user_id", userId).in("id", accountIds).limit(100);
    if (result.error) unavailable = true;
    else accounts = Array.isArray(result.data) ? result.data : [];
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const ownedAccountIds = accountIds.filter((id) => accountById.has(id));
  const aggregateByAd = new Map<string, AdAggregate>();
  const earliestFrom = [...idsByPack.values()].filter((item) => item.ads.some((id) => typeof id === "string" && id.length > 0)).map((item) => item.from).sort()[0];
  if (adIds.length && ownedAccountIds.length && earliestFrom) {
    const insightRows: AdInsightRow[] = [];
    for (let offset = 0; offset < 50000; offset += PAGE_SIZE) {
      const { data, error } = await supabase.from("meta_insights_daily")
        .select("ad_account_id,entity_id,entity_name,impressions,clicks,spend,conversions,conversion_value")
        .eq("level", "ad").in("ad_account_id", ownedAccountIds).in("entity_id", adIds)
        .gte("date_start", earliestFrom).lte("date_start", today).order("date_start", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) { unavailable = true; break; }
      const rows = Array.isArray(data) ? data as AdInsightRow[] : [];
      insightRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    if (!unavailable) {
      for (const row of insightRows) {
        const key = `${row.ad_account_id}:${row.entity_id}`;
        const total = aggregateByAd.get(key) ?? { name: row.entity_name || row.entity_id, impressions: 0, clicks: 0, spend: 0, purchases: 0, purchaseValue: 0 };
        total.name = row.entity_name || total.name;
        total.impressions += numberValue(row.impressions);
        total.clicks += numberValue(row.clicks);
        total.spend += numberValue(row.spend);
        total.purchases += numberValue(row.conversions);
        total.purchaseValue += numberValue(row.conversion_value);
        aggregateByAd.set(key, total);
      }
    }
  }
  if (unavailable) aggregateByAd.clear();
  return packs.map((pack) => {
    const period = idsByPack.get(pack.id)!;
    const variants = Array.isArray(pack.variants) ? pack.variants : [];
    const accountId = typeof pack.meta_ad_account_id === "string" ? pack.meta_ad_account_id : "";
    const account = accountById.get(accountId);
    const ads = period.ads;
    const ad_results = variants.map((variant, index) => {
      const adId = typeof ads[index] === "string" ? ads[index] as string : null;
      const aggregate = adId ? aggregateByAd.get(`${accountId}:${adId}`) : undefined;
      const resultStatus = !adId ? "not_created" : unavailable || !account ? "unavailable" : aggregate ? "ready" : "awaiting_sync";
      return {
        variant_id: variant.id ?? `variant-${index + 1}`,
        ad_id: adId,
        ad_name: aggregate?.name ?? null,
        status: resultStatus,
        impressions: aggregate?.impressions ?? null,
        clicks: aggregate?.clicks ?? null,
        spend: aggregate ? Math.round(aggregate.spend * 100) / 100 : null,
        purchases: aggregate?.purchases ?? null,
        purchase_value: aggregate ? Math.round(aggregate.purchaseValue * 100) / 100 : null,
      };
    });
    return { ...pack, ad_results, results_period: { from: period.from, to: today }, results_currency: account?.currency ?? null, results_synced_at: account?.last_synced_at ?? null };
  });
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  const includeAdResults = params.get("include_ad_results") === "1";
  let query = supabase.from("ad_variant_packs").select("id,client_request_id,store_id,product_id,product_name,status,objective,daily_budget,duration_days,checkpoints,variants,meta_ad_account_id,external_campaign_id,last_error,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Impossible de lire les Packs" }, { status: 500 });
  const packs = Array.isArray(data) ? data as PackRow[] : [];
  return NextResponse.json({ packs: includeAdResults ? await attachAdResults(supabase, user.id, packs) : packs });
}
