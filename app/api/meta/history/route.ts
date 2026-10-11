import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { convertCurrency } from "@/lib/currency";
import { initialBackfillDate } from "@/lib/meta/backfill";

type InsightRow = {
  level: "campaign" | "adset" | "ad";
  entity_id: string;
  entity_name: string | null;
  date_start: string;
  impressions: number | string | null;
  clicks: number | string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
};

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: number, from: string, to: string): number | null {
  const converted = from === to ? value : convertCurrency(value, from, to);
  return converted === null ? null : Math.round(converted * 100) / 100;
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const to = new Date().toISOString().slice(0, 10);
  const from = params.get("from") ?? initialBackfillDate(to);
  const requestedCurrency = params.get("currency")?.trim().toUpperCase().slice(0, 8) ?? "";
  const accounts = supabase.from("meta_ad_accounts")
    .select("id,currency,last_backfill_at,backfill_status")
    .eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accounts.eq("id", accountId).maybeSingle() : accounts.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });
  const accountCurrency = String(account.currency ?? "").trim().toUpperCase();
  if (!accountCurrency) return NextResponse.json({ error: "La devise du compte Meta est inconnue" }, { status: 409 });
  const currency = requestedCurrency || accountCurrency;

  const rows: InsightRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50_000; offset += pageSize) {
    const { data, error } = await supabase.from("meta_insights_daily")
      .select("level,entity_id,entity_name,date_start,impressions,clicks,spend,conversions,conversion_value")
      .eq("ad_account_id", account.id).in("level", ["campaign", "adset", "ad"])
      .gte("date_start", from).lte("date_start", to)
      .order("date_start", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) return NextResponse.json({ error: "Impossible de charger l’historique Meta" }, { status: 500 });
    const batch = (data ?? []) as InsightRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const grouped = new Map<string, { level: InsightRow["level"]; id: string; name: string; impressions: number; clicks: number; spendAccount: number; purchases: number; purchaseValueAccount: number }>();
  const daily = new Map<string, { spendAccount: number; purchases: number; purchaseValueAccount: number }>();
  for (const row of rows) {
    const key = `${row.level}:${row.entity_id}`;
    const current = grouped.get(key) ?? { level: row.level, id: row.entity_id, name: row.entity_name || row.entity_id, impressions: 0, clicks: 0, spendAccount: 0, purchases: 0, purchaseValueAccount: 0 };
    current.impressions += num(row.impressions);
    current.clicks += num(row.clicks);
    current.spendAccount += num(row.spend);
    current.purchases += num(row.conversions);
    current.purchaseValueAccount += num(row.conversion_value);
    grouped.set(key, current);
    if (row.level === "campaign") {
      const day = daily.get(row.date_start) ?? { spendAccount: 0, purchases: 0, purchaseValueAccount: 0 };
      day.spendAccount += num(row.spend);
      day.purchases += num(row.conversions);
      day.purchaseValueAccount += num(row.conversion_value);
      daily.set(row.date_start, day);
    }
  }
  const entities = [...grouped.values()].map((row) => ({
    level: row.level, id: row.id, name: row.name,
    impressions: Math.round(row.impressions), clicks: Math.round(row.clicks), purchases: Math.round(row.purchases),
    spend: money(row.spendAccount, accountCurrency, currency),
    purchaseValue: money(row.purchaseValueAccount, accountCurrency, currency),
  })).sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1));
  const dailyRows = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({
    date, spend: money(row.spendAccount, accountCurrency, currency),
    purchases: Math.round(row.purchases), purchaseValue: money(row.purchaseValueAccount, accountCurrency, currency),
  }));
  return NextResponse.json({
    accountId: account.id, accountCurrency, currency, from, to,
    backfillStatus: account.last_backfill_at ? "complete" : account.backfill_status ?? "pending",
    lastBackfillAt: account.last_backfill_at ?? null,
    sourceLabel: "meta_declared",
    entities, daily: dailyRows,
  });
}
