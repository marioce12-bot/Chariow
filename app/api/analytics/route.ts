import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { addDays, buildOverviewFromPages, daysBetween, type SaleRow } from "@/lib/overview-aggregates";
import { fetchAllPages } from "@/lib/paginated-query";
import { DEFAULT_TARGET_MARGIN } from "@/lib/unit-economics";

type AnalyticsSaleRow = SaleRow & { amount: number | string | null };

// Cookie lisible cote navigateur (non httpOnly, sans donnee sensible) : il permet
// d'afficher un message clair quand Chariow est en panne (voir ChariowStatusNotice).
const STATUS_COOKIE = "vendeo_chariow_status";
function withStatus(response: NextResponse, status: "unavailable" | "expired" | null) {
  if (status) response.cookies.set(STATUS_COOKIE, status, { path: "/", maxAge: 15 * 60, sameSite: "lax" });
  else response.cookies.delete(STATUS_COOKIE);
  return response;
}

// Le serveur MCP de Chariow ne repond pas : timeout (20 s), erreur reseau ou erreur 5xx.
function isChariowDown(message: string) {
  return /timeout|timed out|aborted|fetch failed|ECONN|ENOTFOUND|returned 5\d\d/i.test(message);
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const query = supabase
    .from("stores")
    .select("id, store_name, mcp_url, access_token_encrypted, connection_status, connected_at")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const { data: store, error } = await (storeId ? query.eq("id", storeId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Aucune boutique active" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store, { from, to });
    const normalized = normalizeChariowSnapshot(snapshot, { from: from ?? "", to: to ?? "" });
    const now = new Date();
    const periodFrom = from ?? normalized.kpis.period.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodTo = to ?? normalized.kpis.period.to ?? now.toISOString().slice(0, 10);
    const periodDays = daysBetween(periodFrom, periodTo);
    const previousFrom = addDays(periodFrom, -periodDays);
    const previousTo = addDays(periodFrom, -1);
    const loadSales = (start: string, end: string) => fetchAllPages<AnalyticsSaleRow>((pageFrom, pageTo) =>
      supabase
        .from("chariow_sales")
        .select("status,amount,net_amount,currency,occurred_at,customer_id")
        .eq("store_id", store.id)
        .gte("occurred_at", `${start}T00:00:00.000Z`)
        .lte("occurred_at", `${end}T23:59:59.999Z`)
        .order("occurred_at", { ascending: true })
        .range(pageFrom, pageTo) as unknown as Promise<{ data: AnalyticsSaleRow[] | null; error: unknown | null }>,
    );
    const [current, previous] = await Promise.all([
      loadSales(periodFrom, periodTo),
      loadSales(previousFrom, previousTo),
    ]);

    // Preserve historical dashboard KPIs: gross amount, and do not overwrite
    // the snapshot values when there are no confirmed sales in the period.
    if (current.error) console.error("Chariow sales query error (current period)", current.error);
    if (previous.error) console.error("Chariow sales query error (previous period)", previous.error);
    if (!current.error) {
      const byCurrency = new Map<string, number>();
      let confirmedSales = 0;
      for (const sale of current.rows) {
        if (!isConfirmedChariowSaleStatus(sale.status)) continue;
        confirmedSales += 1;
        const currency = sale.currency?.trim() ? sale.currency.trim().toUpperCase() : "INCONNUE";
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + (Number(sale.amount) || 0));
      }
      if (confirmedSales > 0) {
        const revenueByCurrency = [...byCurrency.entries()].map(([currency, value]) => ({ currency, value: Math.round(value * 100) / 100 }));
        normalized.kpis.revenueByCurrency = revenueByCurrency;
        normalized.kpis.sales = confirmedSales;
        if (revenueByCurrency.length === 1 && revenueByCurrency[0].currency !== "INCONNUE") {
          const grossRevenue = revenueByCurrency[0].value;
          normalized.kpis.revenue = { value: grossRevenue, formatted: `${grossRevenue.toLocaleString("fr-FR")} ${revenueByCurrency[0].currency}` };
        } else {
          normalized.kpis.revenue = { value: null, formatted: "Ventilé par devise" };
        }
      }
    }

    const targetCurrency = normalized.products.find((product) => product.currency)?.currency?.toUpperCase()
      ?? normalized.kpis.revenueByCurrency?.find((item) => item.currency !== "INCONNUE")?.currency
      ?? "XOF";
    const overview = buildOverviewFromPages(current, previous, targetCurrency, periodFrom, periodTo, store.connected_at ?? null, DEFAULT_TARGET_MARGIN);
    return withStatus(NextResponse.json({
      store: { name: normalized.storeName, status: store.connection_status, connectedAt: store.connected_at ?? null },
      snapshot: { ...normalized, overview },
    }), null);
  } catch (analyticsError) {
    const message = analyticsError instanceof Error ? analyticsError.message : String(analyticsError);
    console.error("Chariow analytics error", message);
    if (/returned 401\b/.test(message)) {
      await supabase.from("stores").update({ connection_status: "expired", connection_error: null, last_verified_at: new Date().toISOString() }).eq("id", store.id).eq("user_id", user.id);
      return withStatus(NextResponse.json({ error: "La connexion Chariow a expiré", code: "CHARIOW_EXPIRED" }, { status: 401 }), "expired");
    }
    if (isChariowDown(message)) {
      return withStatus(NextResponse.json({ error: "Chariow ne répond pas pour le moment", code: "CHARIOW_UNAVAILABLE" }, { status: 503 }), "unavailable");
    }
    return withStatus(NextResponse.json({ error: "Les données Chariow sont momentanément indisponibles", code: "CHARIOW_UNAVAILABLE" }, { status: 502 }), "unavailable");
  }
}
