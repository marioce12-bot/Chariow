import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaCampaignList } from "@/lib/meta/campaign-list";

// Campagnes réellement « en cours » chez Meta (statut effectif ACTIVE ou en cours de mise en place).
// Lu en direct : les anciennes campagnes (en pause, archivées, terminées) ne doivent pas apparaître dans la liste.
const RUNNING_STATUSES = new Set(["ACTIVE", "IN_PROCESS"]);

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const accountId = new URL(request.url).searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id requis" }, { status: 400 });
  const { data: account, error } = await supabase
    .from("meta_ad_accounts")
    .select("meta_account_id,access_token_encrypted")
    .eq("user_id", user.id)
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Compte Meta Ads introuvable" }, { status: 404 });
  try {
    const campaigns = await fetchMetaCampaignList(`act_${account.meta_account_id}`, decryptSecret(account.access_token_encrypted));
    return NextResponse.json({ activeIds: campaigns.filter((campaign) => campaign.effectiveStatus && RUNNING_STATUSES.has(campaign.effectiveStatus)).map((campaign) => campaign.id) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Impossible de lire les campagnes Meta" }, { status: 502 });
  }
}
