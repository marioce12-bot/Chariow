import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdCampaignPayment } from "@/lib/payments/saspay";

type Context = { params: Promise<{ id: string }> };

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
  if (!["draft", "error"].includes(campaign.status)) {
    return NextResponse.json({ error: "Cette campagne n'est plus en attente de paiement" }, { status: 409 });
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
    return NextResponse.json({ error: "Impossible de créer le paiement pour le moment" }, { status: 502 });
  }
}
