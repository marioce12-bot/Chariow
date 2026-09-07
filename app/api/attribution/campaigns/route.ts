import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: accounts } = await supabase.from("meta_ad_accounts").select("id").eq("user_id", user.id).eq("is_active", true);
  const accountIds = (accounts ?? []).map((account: { id: string }) => account.id);
  if (!accountIds.length) return NextResponse.json({ campaigns: [], products: [] });

  const { data: campaigns, error: campaignsError } = await supabase
    .from("meta_campaigns")
    .select("id,meta_campaign_id,name,status,objective,ad_account_id")
    .in("ad_account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (campaignsError) return NextResponse.json({ error: "Impossible de charger les campagnes" }, { status: 500 });

  const campaignExternalIds = (campaigns ?? []).map((campaign: { meta_campaign_id: string }) => campaign.meta_campaign_id);
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: insights } = campaignExternalIds.length
    ? await supabase.from("meta_insights_daily").select("entity_id,spend").eq("level", "campaign").in("entity_id", campaignExternalIds).gte("date_start", since)
    : { data: [] as Array<{ entity_id: string; spend: number }> };
  const spendByCampaign = new Map<string, number>();
  for (const row of insights ?? []) spendByCampaign.set(row.entity_id, (spendByCampaign.get(row.entity_id) ?? 0) + Number(row.spend ?? 0));

  const { data: links } = await supabase.from("campaign_product_links").select("meta_campaign_id,product_id,product_name,product_url,confidence").eq("user_id", user.id);
  const linkByCampaign = new Map((links ?? []).map((link: { meta_campaign_id: string }) => [link.meta_campaign_id, link]));

  const result = (campaigns ?? []).map((campaign: { id: string; meta_campaign_id: string; name: string; status: string | null; objective: string | null }) => ({
    id: campaign.id,
    meta_campaign_id: campaign.meta_campaign_id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective,
    spend_30d: Math.round((spendByCampaign.get(campaign.meta_campaign_id) ?? 0) * 100) / 100,
    link: linkByCampaign.get(campaign.id) ?? null,
  }));

  let products: Array<{ id: string; name: string; url: string | null }> = [];
  const { data: store } = await supabase.from("stores").select("id,mcp_url,access_token_encrypted,connection_status").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (store) {
    try {
      const snapshot = await getChariowSnapshot(store as any);
      const normalized = normalizeChariowSnapshot(snapshot, { from: "", to: "" });
      products = (normalized.products ?? []).map((product: any) => ({ id: String(product.id), name: String(product.name ?? "Produit"), url: product.url ?? null }));
    } catch {
      // Chariow momentanément indisponible : on affiche quand même les campagnes,
      // simplement sans pouvoir les lier tant que le catalogue n'est pas rechargé.
    }
  }

  return NextResponse.json({ campaigns: result, products });
}
