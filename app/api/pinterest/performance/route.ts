import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchPinterestCampaignReport } from "@/lib/pinterest/report";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Stats Pinterest Ads (lecture seule) : dépenses, clics, conversions et CPA par campagne.
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = toParam && DATE_RE.test(toParam) ? toParam : new Date().toISOString().slice(0, 10);

  const accountsQuery = supabase.from("pinterest_ad_accounts").select("pinterest_ad_account_id,pinterest_integration_id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accountsQuery.eq("id", accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: "Impossible de charger le compte Pinterest Ads" }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Pinterest Ads connecté" }, { status: 404 });

  const { data: integration, error: integrationError } = await supabase.from("pinterest_integrations").select("access_token_encrypted").eq("id", account.pinterest_integration_id).eq("user_id", user.id).maybeSingle();
  if (integrationError || !integration) return NextResponse.json({ error: "Intégration Pinterest introuvable" }, { status: 404 });

  try {
    const accessToken = decryptSecret(integration.access_token_encrypted);
    const campaigns = await fetchPinterestCampaignReport(account.pinterest_ad_account_id, accessToken, from, to);
    const spend = campaigns.reduce((total, item) => total + item.spend, 0);
    const impressions = campaigns.reduce((total, item) => total + item.impressions, 0);
    const clicks = campaigns.reduce((total, item) => total + item.clicks, 0);
    const conversions = campaigns.reduce((total, item) => total + item.conversions, 0);
    return NextResponse.json({
      currency: account.currency ?? "EUR",
      period: { from, to },
      overview: { spend, impressions, clicks, conversions, cpa: conversions > 0 ? spend / conversions : null, ctr: impressions > 0 ? (clicks / impressions) * 100 : null },
      performances: campaigns.sort((a, b) => b.spend - a.spend),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de lire les stats Pinterest Ads" }, { status: 502 });
  }
}
