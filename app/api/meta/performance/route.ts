import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";
import { decryptSecret } from "@/lib/crypto";
import { calculateProfitability } from "@/lib/profitability";
import type { MetaEntityPerformance } from "@/lib/meta/types";

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);
  const accountsQuery = supabase.from("meta_ad_accounts").select("id,meta_account_id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accountsQuery.eq("id", accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });
  const { data: insightRows, error } = await supabase.from("meta_insights_daily").select("level,entity_id,entity_name,impressions,clicks,spend,conversions,conversion_value").eq("ad_account_id", account.id).gte("date_start", from).lte("date_start", to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let revenue = 0;
  let sales = 0;
  let productPrice = 0;
  let currency = account.currency ?? "XOF";
  const { data: store } = await supabase.from("stores").select("id,mcp_url,access_token_encrypted,store_name").eq("user_id", user.id).eq("is_active", true).eq("platform", "chariow").limit(1).maybeSingle();
  if (store) {
    try {
      const snapshot = await getChariowSnapshot(store, { from, to });
      const normalized = normalizeChariowSnapshot(snapshot, { from, to });
      revenue = Number(normalized.kpis.revenue.value ?? 0) || 0;
      sales = normalized.kpis.sales;
      productPrice = Number(normalized.products[0]?.price ?? 0) || 0;
      currency = normalized.products[0]?.currency ?? currency;
    } catch (storeError) {
      console.warn("Chariow attribution data unavailable", storeError instanceof Error ? storeError.message : storeError);
    }
  }

  const campaignRows = (insightRows ?? []).filter((row: Record<string, unknown>) => row.level === "campaign") as Array<Record<string, unknown>>;
  const performances: MetaEntityPerformance[] = campaignRows.reduce((items: MetaEntityPerformance[], row) => {
    const id = String(row.entity_id);
    const existing = items.find((item) => item.id === id);
    const spend = Number(row.spend ?? 0);
    const conversions = Number(row.conversions ?? 0);
    const conversionValue = Number(row.conversion_value ?? 0);
    if (existing) {
      existing.impressions += Number(row.impressions ?? 0);
      existing.clicks += Number(row.clicks ?? 0);
      existing.spend += spend;
      existing.conversions += conversions;
      existing.conversionValue += conversionValue;
      existing.revenue += conversionValue;
      existing.cpa = existing.conversions > 0 ? existing.spend / existing.conversions : null;
      existing.cac = existing.cpa;
      existing.roas = existing.spend > 0 ? existing.revenue / existing.spend : null;
      existing.status = existing.roas !== null && existing.roas >= 1 ? "profitable" : existing.spend > 0 ? "loss" : "warning";
      return items;
    }
    const roas = spend > 0 ? conversionValue / spend : null;
    items.push({ id, name: String(row.entity_name ?? id), level: "campaign", impressions: Number(row.impressions ?? 0), clicks: Number(row.clicks ?? 0), spend, conversions, conversionValue, revenue: conversionValue, cac: conversions > 0 ? spend / conversions : null, cpa: conversions > 0 ? spend / conversions : null, roas, status: roas !== null && roas >= 1 ? "profitable" : spend > 0 ? "loss" : "warning" });
    return items;
  }, []);

  const totalSpend = sum(insightRows as Array<Record<string, unknown>>, "spend");
  const totalConversions = sum(insightRows as Array<Record<string, unknown>>, "conversions");
  const attributedRevenue = sum(insightRows as Array<Record<string, unknown>>, "conversion_value");
  const profitability = calculateProfitability({ price: productPrice, productCost: 0, platformFees: 0, otherVariableCosts: 0, adSpend: totalSpend, conversionRate: totalSpend > 0 ? totalConversions / totalSpend : 0, refundRate: 0 });
  return NextResponse.json({ currency, period: { from, to }, overview: { spend: totalSpend, conversions: totalConversions, revenue: revenue || attributedRevenue, sales, cpa: totalConversions > 0 ? totalSpend / totalConversions : null, cac: sales > 0 ? totalSpend / sales : null, roas: totalSpend > 0 ? (revenue || attributedRevenue) / totalSpend : null }, profitability, performances });
}
