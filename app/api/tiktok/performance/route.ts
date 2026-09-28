import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";
import { fetchTikTokCampaignReport } from "@/lib/tiktok/report";

// Lecture en direct chez TikTok (pas de table de synchronisation) : dépenses,
// clics, conversions par campagne, croisés avec les ventes réelles Chariow.
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);

  const accountsQuery = supabase.from("tiktok_ad_accounts").select("id,tiktok_advertiser_id,tiktok_integration_id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accountsQuery.eq("id", accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte TikTok Ads connecté" }, { status: 404 });
  const { data: integration, error: integrationError } = await supabase.from("tiktok_integrations").select("access_token_encrypted").eq("id", account.tiktok_integration_id).eq("user_id", user.id).maybeSingle();
  if (integrationError || !integration) return NextResponse.json({ error: "Intégration TikTok introuvable" }, { status: 404 });

  let rows;
  try {
    rows = await fetchTikTokCampaignReport(account.tiktok_advertiser_id, decryptSecret(integration.access_token_encrypted), from, to);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de lire les statistiques TikTok Ads" }, { status: 502 });
  }

  let chariowRevenue = 0;
  let sales = 0;
  let chariowCurrency = account.currency ?? "XOF";
  const { data: store } = await supabase.from("stores").select("id,mcp_url,access_token_encrypted,store_name").eq("user_id", user.id).eq("is_active", true).eq("platform", "chariow").limit(1).maybeSingle();
  if (store) {
    try {
      const snapshot = await getChariowSnapshot(store, { from, to });
      const normalized = normalizeChariowSnapshot(snapshot, { from, to });
      chariowRevenue = Number(normalized.kpis.revenue.value ?? 0) || 0;
      sales = normalized.kpis.sales;
      chariowCurrency = normalized.products[0]?.currency ?? chariowCurrency;
    } catch (storeError) {
      console.warn("Chariow data unavailable for TikTok stats", storeError instanceof Error ? storeError.message : storeError);
    }
  }

  const spend = rows.reduce((total, row) => total + row.spend, 0);
  const clicks = rows.reduce((total, row) => total + row.clicks, 0);
  const impressions = rows.reduce((total, row) => total + row.impressions, 0);
  const conversions = rows.reduce((total, row) => total + row.conversions, 0);
  const performances = rows
    .map((row) => ({ ...row, cpa: row.conversions > 0 ? row.spend / row.conversions : null, ctr: row.impressions > 0 ? row.clicks / row.impressions : null }))
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    currency: account.currency ?? "XOF",
    chariowCurrency,
    period: { from, to },
    overview: { spend, impressions, clicks, ctr: impressions > 0 ? clicks / impressions : null, conversions, cpa: conversions > 0 ? spend / conversions : null, chariowRevenue, sales, cac: sales > 0 ? spend / sales : null },
    performances,
  });
}
