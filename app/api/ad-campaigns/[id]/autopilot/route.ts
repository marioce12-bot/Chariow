import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { validateBudgetLimit } from "@/lib/autopilot-budget";
import { checkAutopilotLiveStatus } from "@/lib/autopilot-live-status";
import { isAutopilotLive } from "@/lib/autopilot-eligibility";

type Context = { params: Promise<{ id: string }> };

const campaignColumns = "id,status,external_error,platform,external_campaign_id,external_adset_id,external_ad_id,meta_ad_account_id,tiktok_ad_account_id,autopilot_enabled,autopilot_budget_limit,autopilot_budget_limit_currency";

export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const { data: campaign, error } = await supabase.from("ad_campaigns").select(campaignColumns).eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !campaign) return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  const liveStatus = await checkAutopilotLiveStatus(supabase, user.id, campaign);
  return NextResponse.json({ autopilot_live_status: liveStatus }, { headers: { "Cache-Control": "private, no-store" } });
}

// Active/désactive le pilotage automatique d'une campagne. Quand il est activé,
// le cron /api/cron/autopilot évalue périodiquement la rentabilité de la
// campagne et peut la mettre en pause automatiquement (avec motif).
export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const { data: campaign, error: readError } = await supabase.from("ad_campaigns")
    .select(campaignColumns)
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (readError || !campaign) return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  if (!body.enabled) {
    const { data, error } = await supabase.from("ad_campaigns").update({ autopilot_enabled: false }).eq("id", id).eq("user_id", user.id)
      .select("id,autopilot_enabled,autopilot_budget_limit,autopilot_budget_limit_currency").single();
    if (error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
    return NextResponse.json({ campaign: { enabled: false, budget_limit: data.autopilot_budget_limit == null ? null : Number(data.autopilot_budget_limit), currency: data.autopilot_budget_limit_currency } });
  }
  if (campaign.platform !== "meta" && campaign.platform !== "tiktok") return NextResponse.json({ error: "UNSUPPORTED_PLATFORM" }, { status: 400 });
  const table = campaign.platform === "meta" ? "meta_ad_accounts" : "tiktok_ad_accounts";
  const accountId = campaign.platform === "meta" ? campaign.meta_ad_account_id : campaign.tiktok_ad_account_id;
  const { data: account } = await supabase.from(table).select("currency").eq("id", accountId).eq("user_id", user.id).maybeSingle();
  if (!account?.currency) return NextResponse.json({ error: "CURRENCY_UNAVAILABLE" }, { status: 400 });
  const authoritativeCurrency = String(account.currency).trim().toUpperCase();
  const explicit = Object.prototype.hasOwnProperty.call(body, "budget_limit") || Object.prototype.hasOwnProperty.call(body, "currency");
  let cap: number, currency: string;
  if (!campaign.autopilot_enabled && !explicit) return NextResponse.json({ error: "INVALID_BUDGET_LIMIT" }, { status: 400 });
  if (explicit) {
    if (!validateBudgetLimit(body.budget_limit, body.currency) || body.budget_limit === null || typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency))
      return NextResponse.json({ error: "INVALID_BUDGET_LIMIT" }, { status: 400 });
    if (body.currency.toUpperCase() !== authoritativeCurrency) return NextResponse.json({ error: "CURRENCY_MISMATCH" }, { status: 400 });
    cap = body.budget_limit; currency = authoritativeCurrency;
  } else {
    cap = Number(campaign.autopilot_budget_limit);
    currency = String(campaign.autopilot_budget_limit_currency ?? "").toUpperCase();
    if (cap === null || !validateBudgetLimit(cap, currency)) return NextResponse.json({ error: "INVALID_BUDGET_LIMIT" }, { status: 400 });
    if (currency !== authoritativeCurrency) return NextResponse.json({ error: "CURRENCY_MISMATCH" }, { status: 400 });
  }
  const liveStatus = await checkAutopilotLiveStatus(supabase, user.id, campaign);
  if (!isAutopilotLive(liveStatus)) return NextResponse.json({ error: liveStatus.state === "inactive" ? "CAMPAIGN_NOT_ACTIVE" : "CAMPAIGN_STATUS_UNVERIFIED", autopilot_live_status: liveStatus }, { status: 409 });
  const { data, error } = await supabase.from("ad_campaigns").update({ autopilot_enabled: true, autopilot_budget_limit: cap, autopilot_budget_limit_currency: currency }).eq("id", id).eq("user_id", user.id).eq("status", "active")
    .select("id,autopilot_enabled,autopilot_budget_limit,autopilot_budget_limit_currency").single();
  if (error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  return NextResponse.json({ campaign: { enabled: true, budget_limit: Number(data.autopilot_budget_limit), currency: data.autopilot_budget_limit_currency } });
}
