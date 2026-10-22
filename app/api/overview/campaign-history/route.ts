import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aggregateDailyAutopilotReports, type AutopilotReportSnapshot } from "@/lib/autopilot";
import { fetchAllPages } from "@/lib/paginated-query";

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id") ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const to = params.get("to") ?? today;
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = params.get("from") ?? defaultFrom;
  const currency = (params.get("currency") ?? "XOF").trim().toUpperCase().slice(0, 8);
  if (!storeId) return NextResponse.json({ daily: [], currency, from, to });
  if (!isIsoDate(from) || !isIsoDate(to) || from > to || !currency) {
    return NextResponse.json({ error: "Période ou devise invalide" }, { status: 400 });
  }

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .in("platform", ["chariow", "shopify"])
    .eq("is_active", true)
    .maybeSingle();
  if (storeError) return NextResponse.json({ error: "Impossible de vérifier la boutique" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

  const { data: campaigns, error: campaignError } = await supabase.from("ad_campaigns")
    .select("id")
    .eq("user_id", user.id)
    .eq("store_id", store.id)
    .eq("platform", "meta")
    .limit(1000);
  if (campaignError) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });
  const campaignIds = (campaigns ?? []).map((campaign: { id: string }) => campaign.id);
  if (!campaignIds.length) return NextResponse.json({ daily: [], currency, from, to });

  const previousDay = new Date(`${from}T00:00:00.000Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const reports = await fetchAllPages<AutopilotReportSnapshot>((pageFrom, pageTo) =>
    supabase.from("ad_campaign_autopilot_reports")
      .select("campaign_id,created_at,spend,net_revenue,currency")
      .eq("user_id", user.id)
      .in("campaign_id", campaignIds)
      .gte("created_at", `${previousDay.toISOString().slice(0, 10)}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`)
      .order("created_at", { ascending: true })
      .range(pageFrom, pageTo) as unknown as Promise<{ data: AutopilotReportSnapshot[] | null; error: unknown | null }>,
    1000,
    100_000,
  );
  if (reports.error) return NextResponse.json({ error: "Impossible de charger les rapports quotidiens" }, { status: 500 });

  const daily = aggregateDailyAutopilotReports(reports.rows, from, to, currency);
  return NextResponse.json({ daily, currency, from, to, source: { spend: "meta_declared", netRevenue: "verified" } });
}
