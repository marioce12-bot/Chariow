import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/**
 * Dépense Meta jour par jour (niveau campagne, tous niveaux imbriqués exclus) pour un compte publicitaire.
 * Alimente la courbe du composant AdSpendByChannel. La devise est celle du compte : la conversion en USD
 * est faite côté client, comme pour le reste de la carte.
 */

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);

  const accountsQuery = supabase.from("meta_ad_accounts").select("id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accountsQuery.eq("id", accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });

  const currency = String(account.currency || "").trim().toUpperCase();
  if (!currency) return NextResponse.json({ error: "La devise du compte publicitaire n’est pas renseignée" }, { status: 409 });

  const byDate = new Map<string, number>();
  const pageSize = 1000;
  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("meta_insights_daily")
      .select("date_start,spend")
      .eq("ad_account_id", account.id)
      .eq("level", "campaign")
      .gte("date_start", from)
      .lte("date_start", to)
      .order("date_start", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as Array<{ date_start: string | null; spend: number | string | null }>;
    for (const row of rows) {
      const date = String(row.date_start ?? "").slice(0, 10);
      if (!date) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + num(row.spend));
    }
    if (rows.length < pageSize) break;
  }

  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, spend]) => ({ date, spend }));
  return NextResponse.json({ currency, period: { from, to }, days });
}
