import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchTikTokIdentities } from "@/lib/tiktok/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const accountId = new URL(request.url).searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id manquant" }, { status: 400 });
  const { data: account, error: accountError } = await supabase.from("tiktok_ad_accounts").select("tiktok_advertiser_id,tiktok_integration_id").eq("id", accountId).eq("user_id", user.id).maybeSingle();
  if (accountError || !account) return NextResponse.json({ error: "Compte TikTok introuvable" }, { status: 404 });
  const { data: integration, error: integrationError } = await supabase.from("tiktok_integrations").select("access_token_encrypted").eq("id", account.tiktok_integration_id).eq("user_id", user.id).maybeSingle();
  if (integrationError || !integration) return NextResponse.json({ error: "Intégration TikTok introuvable" }, { status: 404 });
  try {
    const accessToken = decryptSecret(integration.access_token_encrypted);
    const identities = await fetchTikTokIdentities(account.tiktok_advertiser_id, accessToken);
    return NextResponse.json({ identities: identities.map((identity) => { const row = identity as Record<string, unknown>; return { id: row.identity_id, type: row.identity_type, name: row.display_name }; }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de lire les identités TikTok" }, { status: 502 });
  }
}
