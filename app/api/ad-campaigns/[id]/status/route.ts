import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";
import { isMetaPausedReason, markMetaPausedReason } from "@/lib/meta/status";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,platform,status,external_ad_id,meta_ad_account_id,external_error")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

  const shouldCheckMeta = campaign.platform === "meta"
    && Boolean(campaign.external_ad_id)
    && (campaign.status === "review" || campaign.status === "active" || (campaign.status === "paused" && isMetaPausedReason(campaign.external_error)));
  if (!shouldCheckMeta) return NextResponse.json({ status: campaign.status });

  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("access_token_encrypted,account_status")
    .eq("id", campaign.meta_ad_account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError || !account) return NextResponse.json({ status: campaign.status });

  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    const { effectiveStatus, feedback } = await getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken });
    const accountStatus = typeof account.account_status === "number" ? account.account_status : null;
    const mapped = mapMetaEffectiveStatus(effectiveStatus, feedback, accountStatus);
    if (!mapped) return NextResponse.json({ status: campaign.status, meta_effective_status: effectiveStatus });

    const externalError = mapped.status === "paused"
      ? markMetaPausedReason(mapped.error ?? "Meta signale que la publicité est en pause.")
      : mapped.error;
    if (mapped.status !== campaign.status || externalError !== campaign.external_error) {
      const { error: updateError } = await supabase
        .from("ad_campaigns")
        .update({ status: mapped.status, external_error: externalError })
        .eq("id", campaign.id)
        .eq("user_id", user.id);
      if (updateError) return NextResponse.json({ status: campaign.status, meta_effective_status: effectiveStatus });
    }
    return NextResponse.json({ status: mapped.status, external_error: externalError, meta_effective_status: effectiveStatus, account_status: accountStatus });
  } catch {
    // Si Meta est indisponible, on conserve le statut enregistré.
    return NextResponse.json({ status: campaign.status });
  }
}
