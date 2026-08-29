import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { calculateProfitabilityAggregate } from "@/lib/profitability-aggregates";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = params.get("to") ?? new Date().toISOString();
  const { data: accounts, error: accountError } = await supabase.from("meta_ad_accounts").select("id").eq("user_id", user.id).eq("is_active", true);
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  const accountIds = (accounts ?? []).map((account) => account.id);
  const { data: insights, error: insightError } = accountIds.length ? await supabase.from("meta_insights_daily").select("spend").in("ad_account_id", accountIds).gte("date_start", from.slice(0, 10)).lte("date_start", to.slice(0, 10)) : { data: [], error: null };
  if (insightError) return NextResponse.json({ error: insightError.message }, { status: 500 });
  const salesQuery = supabase.from("chariow_sales").select("status,amount,net_amount").gte("occurred_at", from).lte("occurred_at", to);
  const { data: sales, error: salesError } = await (storeId ? salesQuery.eq("store_id", storeId) : salesQuery);
  if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });
  const { data: attributions } = await supabase.from("meta_attributions").select("attributed_net_revenue").eq("user_id", user.id).gte("attributed_at", from).lte("attributed_at", to);
  const spend = (insights ?? []).reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const attributedNetRevenue = (attributions ?? []).reduce((sum, row) => sum + Number(row.attributed_net_revenue ?? 0), 0);
  const aggregate = calculateProfitabilityAggregate({ spend, sales: sales ?? [], attributedNetRevenue });
  const periodKey = `${from.slice(0, 10)}:${to.slice(0, 10)}:${storeId ?? "all"}`;
  const alerts = [];
  if (aggregate.spend > 0 && aggregate.completedSales === 0) alerts.push({ alert_key: "spend_without_sales", severity: "warning", title: "Dépenses sans vente", description: "Meta a dépensé sur la période, mais aucune vente Chariow complétée n’est persistée.", dedupe_key: `spend_without_sales:${periodKey}`, store_id: storeId ?? null, metadata: { spend: aggregate.spend } });
  if (aggregate.abandonmentRate !== null && aggregate.abandonmentRate >= 0.5) alerts.push({ alert_key: "high_abandonment_rate", severity: "warning", title: "Taux d’abandon élevé", description: `Le taux d’abandon est de ${(aggregate.abandonmentRate * 100).toFixed(1)} % sur la période.`, dedupe_key: `high_abandonment_rate:${periodKey}`, store_id: storeId ?? null, metadata: { abandonmentRate: aggregate.abandonmentRate } });
  if (aggregate.vendeoAttributedRoas !== null && aggregate.vendeoAttributedRoas < 1) alerts.push({ alert_key: "negative_attributed_roas", severity: "critical", title: "ROAS attribué inférieur à 1", description: "Le revenu net Chariow attribué est inférieur aux dépenses Meta sur la période.", dedupe_key: `negative_attributed_roas:${periodKey}`, store_id: storeId ?? null, metadata: { roas: aggregate.vendeoAttributedRoas } });
  for (const alert of alerts) await supabase.from("vendeo_alerts").upsert({ user_id: user.id, ...alert, updated_at: new Date().toISOString() }, { onConflict: "user_id,dedupe_key" });
  return NextResponse.json({ period: { from, to }, aggregate, generatedAlerts: alerts.length });
}
