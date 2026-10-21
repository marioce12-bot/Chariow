import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";
import { evaluateMetaDelivery } from "@/lib/meta/delivery";
import { getMetaCampaignLifecycle, markMetaPausedReason } from "@/lib/meta/status";
import { getMetaCreativePatch } from "@/lib/meta/creative-sync";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const { data: campaign, error: campaignError } = await supabase.from("ad_campaigns")
    .select("id,platform,status,external_ad_id,meta_ad_account_id,external_error,meta_delivery_observation,external_creative_id,media_url,carousel_urls")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  const lifecycle = getMetaCampaignLifecycle(campaign.status, campaign.external_error);
  if (lifecycle === "archived" || lifecycle === "deleted") return NextResponse.json({ status: lifecycle, external_error: campaign.external_error });
  const shouldCheckMeta = campaign.platform === "meta" && ["review", "preparing", "unknown", "active", "paused", "autopilot_paused", "rejected"].includes(campaign.status);
  if (!shouldCheckMeta) return NextResponse.json({ status: campaign.status });
  const unavailable = async () => {
    // Keep the record/history but never present a cached Active assertion as fresh.
    await supabase.from("ad_campaigns").update({ status: "unknown", external_error: null }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ status: "unknown", status_verified: false }, { headers: { "Cache-Control": "private, no-store" } });
  };
  if (!campaign.external_ad_id) return unavailable();
  const { data: account, error: accountError } = await supabase.from("meta_ad_accounts")
    .select("access_token_encrypted,account_status").eq("id", campaign.meta_ad_account_id).eq("user_id", user.id).maybeSingle();
  if (accountError || !account?.access_token_encrypted) return unavailable();
  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    const [snapshot, creativePatch] = await Promise.all([
      getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken }),
      getMetaCreativePatch({ adId: campaign.external_ad_id, accessToken, campaign }),
    ]);
    const accountStatus = typeof account.account_status === "number" ? account.account_status : null;
    const mapped = mapMetaEffectiveStatus(snapshot.effectiveStatus, snapshot.feedback, accountStatus, snapshot.impressions);
    if (!mapped) return unavailable();
    const delivery = evaluateMetaDelivery(campaign.external_ad_id, snapshot, campaign.meta_delivery_observation);
    // Keep the API status separate from stricter Autopilot delivery evidence.
    // An unconfirmed revision is not a Meta Preparing status.
    const externalError = mapped.status === "paused" ? markMetaPausedReason(mapped.error ?? "Meta signale que la publicité est en pause.") : mapped.error;
    const observation = ["active", "preparing"].includes(mapped.status) ? delivery.observation : null;
    if (Object.keys(creativePatch).length || mapped.status !== campaign.status || externalError !== campaign.external_error || JSON.stringify(observation) !== JSON.stringify(campaign.meta_delivery_observation ?? null)) {
      const { error } = await supabase.from("ad_campaigns").update({ status: mapped.status, external_error: externalError, meta_delivery_observation: observation, ...creativePatch }).eq("id", id).eq("user_id", user.id);
      if (error) {
        console.warn("Meta status persistence failed", { campaignId: id });
        return NextResponse.json({ status: "unknown", status_verified: false }, { status: 503 });
      }
    }
    return NextResponse.json({ status: mapped.status, external_error: externalError, meta_effective_status: snapshot.effectiveStatus, delivery_evidence: delivery.state, account_status: accountStatus, status_verified: mapped.status !== "unknown" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.warn("Meta campaign status verification failed", { campaignId: id });
    return unavailable();
  }
}
