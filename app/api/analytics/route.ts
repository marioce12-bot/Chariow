import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";

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
  const storeId = new URL(request.url).searchParams.get("store_id");
  const from = new URL(request.url).searchParams.get("from") ?? undefined;
  const to = new URL(request.url).searchParams.get("to") ?? undefined;
  const query = supabase.from("stores").select("id, store_name, mcp_url, access_token_encrypted, connection_status").eq("user_id", user.id).eq("is_active", true);
  const { data: store, error } = await (storeId ? query.eq("id", storeId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Aucune boutique active" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store, { from, to });
    const normalized = normalizeChariowSnapshot(snapshot, { from: from ?? "", to: to ?? "" });
    const now = new Date();
    const periodFrom = from ?? normalized.kpis.period.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodTo = to ?? normalized.kpis.period.to ?? now.toISOString().slice(0, 10);
    const byCurrency = new Map<string, number>();
    let confirmedSales = 0;
    for (let offset = 0; offset < 20_000; offset += 1000) {
      const { data: rows, error: salesError } = await supabase
        .from("chariow_sales")
        .select("status,amount,currency,occurred_at")
        .eq("store_id", store.id)
        .gte("occurred_at", `${periodFrom}T00:00:00.000Z`)
        .lte("occurred_at", `${periodTo}T23:59:59.999Z`)
        .order("occurred_at", { ascending: true })
        .range(offset, offset + 999);
      if (salesError) break;
      const batch = rows ?? [];
      for (const sale of batch) {
        if (!isConfirmedChariowSaleStatus(sale.status)) continue;
        confirmedSales += 1;
        const currency = typeof sale.currency === "string" && sale.currency.trim() ? sale.currency.trim().toUpperCase() : "INCONNUE";
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + (Number(sale.amount) || 0));
      }
      if (batch.length < 1000) break;
    }
    if (confirmedSales > 0) {
      const revenueByCurrency = [...byCurrency.entries()].map(([currency, value]) => ({ currency, value: Math.round(value * 100) / 100 }));
      normalized.kpis.revenueByCurrency = revenueByCurrency;
      normalized.kpis.sales = confirmedSales;
      if (revenueByCurrency.length === 1 && revenueByCurrency[0].currency !== "INCONNUE") {
        normalized.kpis.revenue = { value: revenueByCurrency[0].value, formatted: `${revenueByCurrency[0].value.toLocaleString("fr-FR")} ${revenueByCurrency[0].currency}` };
      } else {
        normalized.kpis.revenue = { value: null, formatted: "Ventilé par devise" };
      }
    }
    return withStatus(NextResponse.json({ store: { name: normalized.storeName, status: store.connection_status }, snapshot: normalized }), null);
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
