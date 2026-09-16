import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { activateMetaCampaign } from "@/lib/meta/campaigns";

type Context = { params: Promise<{ id: string }> };

// Appelée une seule fois le paiement confirmé (status "paid", cf. webhook SasPay).
// Ne recrée RIEN chez Meta/TikTok : elle bascule simplement la campagne, l'adset et
// l'ad déjà créés (en PAUSED par /launch) vers ACTIVE. C'est ce basculement — et lui
// seul — qui soumet la campagne à la modération Meta et démarre la diffusion.
export async function POST(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,platform,status,meta_ad_account_id,tiktok_ad_account_id,external_campaign_id,external_adset_id,external_ad_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (campaign.status !== "paid") {
    // Idempotent : si l'activation a déjà réussi (retry du client après un
    // rafraîchissement par ex.), on ne renvoie pas d'erreur bloquante.
    if (["review", "active"].includes(campaign.status)) return NextResponse.json({ campaign });
    return NextResponse.json({ error: "Le paiement n'est pas encore confirmé pour cette campagne." }, { status: 409 });
  }
  if (!campaign.external_campaign_id || !campaign.external_adset_id || !campaign.external_ad_id) {
    return NextResponse.json({ error: "Campagne payée mais jamais créée chez la plateforme publicitaire — contacte le support." }, { status: 500 });
  }

  if (campaign.platform === "tiktok") {
    // L'activation TikTok (operation_status ENABLE) n'est pas encore branchée ici —
    // seul le chemin Meta est couvert pour l'instant.
    return NextResponse.json({ error: "L'activation automatique TikTok n'est pas encore disponible. Contacte le support." }, { status: 501 });
  }

  const { data: account, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("access_token_encrypted")
    .eq("id", campaign.meta_ad_account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError || !account) return NextResponse.json({ error: "Compte Meta introuvable" }, { status: 404 });

  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    await activateMetaCampaign({
      campaignId: campaign.external_campaign_id,
      adSetId: campaign.external_adset_id,
      adId: campaign.external_ad_id,
      accessToken,
    });
    const { data: updated, error: updateError } = await supabase
      .from("ad_campaigns")
      .update({ status: "review", external_error: null })
      .eq("id", campaign.id)
      .eq("user_id", user.id)
      .select("id,status,external_campaign_id,external_adset_id,external_ad_id")
      .single();
    if (updateError) return NextResponse.json({ error: "Campagne activée chez Meta mais statut Vendeo non enregistré" }, { status: 502 });
    await supabase.from("meta_campaigns").update({ status: "ACTIVE" }).eq("meta_campaign_id", campaign.external_campaign_id);
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    // Le paiement est déjà encaissé ici : on NE remet PAS le statut à "error" générique
    // (qui masquerait que la campagne a bien été payée). On garde "paid" pour permettre
    // un nouveau clic sur "Réessayer l'activation" côté client, et on renvoie le détail.
    const message = error instanceof Error ? error.message.slice(0, 500) : "Activation Meta échouée";
    await supabase.from("ad_campaigns").update({ external_error: message }).eq("id", campaign.id).eq("user_id", user.id);
    return NextResponse.json({ error: `Paiement confirmé, mais Meta n’a pas accepté l’activation : ${message}. Réessaie — le paiement n’est pas perdu.` }, { status: 502 });
  }
}
