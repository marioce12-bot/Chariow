import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchTikTokCampaignReport } from "@/lib/tiktok/reports";

// GET /api/tiktok/stats?days=30[&account_id=...]
// Lit les stats en direct chez TikTok (pas de stockage en base) : dépenses,
// impressions, clics, conversions par campagne + totaux.
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 90);
  const accountId = url.searchParams.get("account_id");
  const query = supabase.from("tiktok_ad_accounts").select("id,tiktok_advertiser_id,tiktok_integration_id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error } = await (accountId ? query.eq("id", accountId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: "Impossible de charger le compte TikTok" }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte TikTok Ads connecté" }, { status: 404 });
  const { data: integration } = await supabase.from("tiktok_integrations").select("access_token_encrypted").eq("id", account.tiktok_integration_id).eq("user_id", user.id).maybeSingle();
  if (!integration) return NextResponse.json({ error: "Intégration TikTok introuvable" }, { status: 404 });

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  try {
    const campaigns = await fetchTikTokCampaignReport(account.tiktok_advertiser_id, decryptSecret(integration.access_token_encrypted), from, to);
    const totals = campaigns.reduce((acc, c) => ({ spend: acc.spend + c.spend, impressions: acc.impressions + c.impressions, clicks: acc.clicks + c.clicks, conversions: acc.conversions + c.conversions }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
    campaigns.sort((a, b) => b.spend - a.spend);
    return NextResponse.json({ currency: account.currency, from, to, totals, campaigns });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "TikTok report failed";
    console.error("TikTok stats failed", message);
    const permission = /permission|scope|auth/i.test(message);
    return NextResponse.json({ error: permission ? "TikTok refuse l'accès aux rapports : déconnecte puis reconnecte TikTok Ads en autorisant toutes les permissions." : `Impossible de récupérer les stats TikTok : ${message}` }, { status: 502 });
  }
}
