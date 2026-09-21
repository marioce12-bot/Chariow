import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdCampaignPayment } from "@/lib/payments/saspay";

type Context = { params: Promise<{ id: string }> };

// Le paiement est désormais demandé AVANT toute création chez Meta/TikTok (pas
// après, comme dans une version précédente) : la campagne existe seulement côté
// Vendeo ("draft") au moment où le paiement est proposé. C'est seulement une fois
// le paiement confirmé (status "paid", cf. webhook SasPay) que /launch envoie la
// campagne à Meta/TikTok — voir /launch pour la création réelle et la logique de
// nouvel essai sans repayer si la plateforme publicitaire la refuse.
// "paused" reste accepté pour compatibilité avec d'éventuelles campagnes créées
// sous l'ancien flux (créées gratuitement chez Meta avant paiement) : /launch sait
// activer ces campagnes déjà existantes au lieu d'en recréer une deuxième.
export async function POST(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,status,daily_budget,duration_days,estimated_budget")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (!["draft", "paused"].includes(campaign.status)) {
    return NextResponse.json({ error: "Cette campagne ne peut pas être payée dans son état actuel." }, { status: 409 });
  }

  const netAdBudget = Number(campaign.daily_budget) * Number(campaign.duration_days);
  const grossAmount = Math.round((netAdBudget / 0.98) * 100) / 100;

  const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();

  try {
    const checkout = await createAdCampaignPayment(
      grossAmount,
      { email: profile?.email || user.email, name: profile?.full_name || undefined },
      { userId: user.id, campaignId: campaign.id },
    );
    await supabase
      .from("ad_campaigns")
      .update({ status: "pending_payment", saspay_checkout_id: checkout.id })
      .eq("id", campaign.id)
      .eq("user_id", user.id);
    return NextResponse.json({ checkout });
  } catch (error) {
    console.error("SasPay ad-campaign checkout error", error instanceof Error ? error.message : "unknown error");
    // Aucune mise à jour n'a eu lieu avant cette erreur : la campagne reste dans son
    // état d'origine ("draft" ou "paused"), prête à retenter le paiement.
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
