import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { createMetaCampaign } from "@/lib/meta/campaigns";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { meta_ad_account_id?: string } | null;
  const { data: campaign, error: campaignError } = await supabase.from("ad_campaigns").select("id,store_id,title,objective,daily_budget,status,meta_ad_account_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (["active", "submitting", "review"].includes(campaign.status)) return NextResponse.json({ error: "Cette campagne est déjà en cours de traitement" }, { status: 409 });
  const accountId = typeof body?.meta_ad_account_id === "string" ? body.meta_ad_account_id : campaign.meta_ad_account_id;
  if (!accountId) return NextResponse.json({ error: "Sélectionne un compte Meta Ads" }, { status: 400 });
  const { data: account, error: accountError } = await supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted,is_active,account_status").eq("id", accountId).eq("user_id", user.id).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Impossible de vérifier le compte Meta" }, { status: 500 });
  if (!account?.is_active) return NextResponse.json({ error: "Le compte Meta sélectionné n’est plus actif" }, { status: 400 });
  if (account.account_status !== null && account.account_status !== 1) return NextResponse.json({ error: "Le compte Meta n’est pas autorisé à diffuser des publicités" }, { status: 400 });
  await supabase.from("ad_campaigns").update({ status: "submitting", meta_ad_account_id: account.id, external_error: null }).eq("id", campaign.id).eq("user_id", user.id);
  try {
    const external = await createMetaCampaign({ accountId: `act_${account.meta_account_id}`, accessToken: decryptSecret(account.access_token_encrypted), name: campaign.title || "Campagne Vendeo", objective: campaign.objective, dailyBudget: Number(campaign.daily_budget) });
    const { data: updated, error: updateError } = await supabase.from("ad_campaigns").update({ status: "review", meta_ad_account_id: account.id, external_campaign_id: external.id, external_error: null }).eq("id", campaign.id).eq("user_id", user.id).select("id,status,external_campaign_id").single();
    if (updateError) return NextResponse.json({ error: "Campagne Meta créée mais statut Vendeo non enregistré" }, { status: 502 });
    await supabase.from("meta_campaigns").upsert({ ad_account_id: account.id, meta_campaign_id: external.id, name: campaign.title || "Campagne Vendeo", status: "PAUSED", objective: external.objective }, { onConflict: "ad_account_id,meta_campaign_id" });
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Meta campaign creation failed";
    await supabase.from("ad_campaigns").update({ status: "error", external_error: message }).eq("id", campaign.id).eq("user_id", user.id);
    return NextResponse.json({ error: `Meta n’a pas accepté la campagne : ${message}` }, { status: 502 });
  }
}
