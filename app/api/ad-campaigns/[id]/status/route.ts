import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,platform,status,external_ad_id,meta_ad_account_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

  // Rien à vérifier si ce n'est pas une campagne Meta en cours de modération.
  if (campaign.platform !== "meta" || campaign.status !== "review" || !campaign.external_ad_id) {
    return NextResponse.json({ status: campaign.status });
  }

  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("access_token_encrypted")
    .eq("id", campaign.meta_ad_account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError || !account) return NextResponse.json({ status: campaign.status });

  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    const { effectiveStatus, feedback } = await getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken });
    const mapped = mapMetaEffectiveStatus(effectiveStatus, feedback);
    if (mapped) {
      await supabase.from("ad_campaigns").update({ status: mapped.status, external_error: mapped.error }).eq("id", campaign.id).eq("user_id", user.id);
      return NextResponse.json({ status: mapped.status, meta_effective_status: effectiveStatus });
    }
    return NextResponse.json({ status: campaign.status, meta_effective_status: effectiveStatus });
  } catch (error) {
    // On ne casse pas l'affichage si Meta est indisponible : on garde le statut actuel.
    return NextResponse.json({ status: campaign.status });
  }
}
