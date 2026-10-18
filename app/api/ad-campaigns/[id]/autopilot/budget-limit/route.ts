import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { validateBudgetLimit } from "@/lib/autopilot-budget";
type Context = { params: Promise<{ id: string }> };
async function load(supabase: any, id: string, userId: string) {
  const { data, error } = await supabase.from("ad_campaigns").select("id,autopilot_enabled,platform,meta_ad_account_id,tiktok_ad_account_id,autopilot_budget_limit,autopilot_budget_limit_currency").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return { error: "CAMPAIGN_NOT_FOUND" as const };
  if (data.platform !== "meta" && data.platform !== "tiktok") return { error: "UNSUPPORTED_PLATFORM" as const };
  const table = data.platform === "meta" ? "meta_ad_accounts" : "tiktok_ad_accounts";
  const accountId = data.platform === "meta" ? data.meta_ad_account_id : data.tiktok_ad_account_id;
  const { data: account, error: accountError } = await supabase.from(table).select("currency").eq("id", accountId).eq("user_id", userId).maybeSingle();
  if (accountError || !account?.currency || typeof account.currency !== "string") return { error: "CURRENCY_UNAVAILABLE" as const };
  const currency = account.currency.trim().toUpperCase();
  const cap = data.autopilot_budget_limit == null ? null : Number(data.autopilot_budget_limit);
  return { data: { budget_limit: data.autopilot_budget_limit_currency?.toUpperCase() === currency ? cap : null, currency, autopilot_enabled: Boolean(data.autopilot_enabled) } };
}
export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser(); if (!user) return response;
  const { id } = await context.params; const result = await load(supabase, id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "CAMPAIGN_NOT_FOUND" ? 404 : 400 });
  return NextResponse.json(result.data);
}
export async function PATCH(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser(); if (!user) return response;
  const { id } = await context.params; const initial = await load(supabase, id, user.id);
  if ("error" in initial) return NextResponse.json({ error: initial.error }, { status: initial.error === "CAMPAIGN_NOT_FOUND" ? 404 : 400 });
  if (!initial.data.autopilot_enabled) return NextResponse.json({ error: "AUTOPILOT_DISABLED" }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "budget_limit") || !validateBudgetLimit(body.budget_limit, body.currency) || typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency))
    return NextResponse.json({ error: "INVALID_BUDGET_LIMIT" }, { status: 400 });
  if (body.currency.toUpperCase() !== initial.data.currency) return NextResponse.json({ error: "CURRENCY_MISMATCH" }, { status: 400 });
  const { data: campaign } = await supabase.from("ad_campaigns").select("platform,meta_ad_account_id,tiktok_ad_account_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  const table = campaign.platform === "meta" ? "meta_ad_accounts" : "tiktok_ad_accounts";
  const accountId = campaign.platform === "meta" ? campaign.meta_ad_account_id : campaign.tiktok_ad_account_id;
  const { data: latest } = await supabase.from(table).select("currency").eq("id", accountId).eq("user_id", user.id).maybeSingle();
  if (!latest?.currency) return NextResponse.json({ error: "CURRENCY_UNAVAILABLE" }, { status: 400 });
  if (String(latest.currency).trim().toUpperCase() !== body.currency.toUpperCase()) return NextResponse.json({ error: "CURRENCY_MISMATCH" }, { status: 400 });
  const { error } = await supabase.from("ad_campaigns").update({ autopilot_budget_limit: body.budget_limit, autopilot_budget_limit_currency: body.budget_limit === null ? null : body.currency.toUpperCase() }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  return NextResponse.json({ budget_limit: body.budget_limit, currency: body.budget_limit === null ? latest.currency.toUpperCase() : body.currency.toUpperCase() });
}
