import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShopifySnapshot } from "./client";
import { normalizeShopifySnapshot } from "./analytics";
import { shopifySaleRows } from "./sales";
import { filterRetainedShopifySales, retentionCutoff } from "./retention";
import { addDays, buildOverviewFromPages, daysBetween, type SaleRow } from "@/lib/overview-aggregates";
import { fetchAllPages } from "@/lib/paginated-query";
import { DEFAULT_TARGET_MARGIN } from "@/lib/unit-economics";

type Store = { id: string; user_id?: string; store_name: string; connection_status?: string; connected_at?: string | null };
type Row = SaleRow & { amount: number | string | null; product_id: string | null; raw_payload?: { line_items?: Array<{ product_id?: string | null }> } };
export async function shopifyDashboardResponse(supabase: any, userId: string, store: Store, opts: { from?: string; to?: string }) {
  try {
    const admin = createAdminClient();
    const snapshot = await getShopifySnapshot(store, opts);
    snapshot.sales.data = await filterRetainedShopifySales(admin, store.id, snapshot.sales.data, new Date());
    const normalized = normalizeShopifySnapshot(snapshot, snapshot.period);
    const rows = shopifySaleRows(store.id, normalized.sales);
    let persistenceError = false;
    if (rows.length) {
      const { error } = await admin.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" });
      persistenceError = Boolean(error);
    }
    const historicalLimit = "Historique Shopify limité à 60 jours ; les périodes plus anciennes peuvent être incomplètes.";
    await admin.from("stores").update({ sales_last_synced_at: new Date().toISOString(), sales_last_sync_complete: false, sales_sync_error: persistenceError ? "Les ventes Shopify n’ont pas pu être enregistrées." : snapshot.coverage.sales.reason ?? historicalLimit }).eq("id", store.id).eq("user_id", userId).eq("platform", "shopify");
    const { from, to } = snapshot.period;
    const days = daysBetween(from, to);
    const cutoff = retentionCutoff(new Date());
    const cutoffDay = cutoff.slice(0, 10);
    const requestedPreviousFrom = addDays(from, -days);
    const requestedPreviousTo = addDays(from, -1);
    const currentFrom = from < cutoffDay ? cutoffDay : from;
    const previousFrom = requestedPreviousFrom < cutoffDay ? cutoffDay : requestedPreviousFrom;
    const loadSales = (start: string, end: string) => fetchAllPages<Row>((a, b) => supabase.from("chariow_sales").select("status,amount,net_amount,currency,occurred_at,customer_id,product_id,raw_payload").eq("store_id", store.id).gte("occurred_at", cutoff).gte("occurred_at", `${start}T00:00:00.000Z`).lte("occurred_at", `${end}T23:59:59.999Z`).order("occurred_at", { ascending: true }).range(a, b));
    const [current, previous] = await Promise.all([loadSales(currentFrom, to), loadSales(previousFrom, requestedPreviousTo)]);
    const currency = snapshot.store.currencyCode || normalized.products.find(p => p.currency)?.currency || normalized.kpis.revenueByCurrency[0]?.currency || "USD";
    const retentionTruncated = from <= cutoffDay || requestedPreviousFrom <= cutoffDay;
    const complete = !persistenceError && !retentionTruncated && snapshot.coverage.sales.complete && !current.error && !previous.error;
    const overview = complete ? buildOverviewFromPages(current, previous, currency, from, to, store.connected_at ?? null, DEFAULT_TARGET_MARGIN) : null;
    const counts = new Map<string, number>();
    for (const sale of current.rows) {
      if (sale.status !== "paid") continue;
      const ids = new Set((sale.raw_payload?.line_items ?? []).map(item => item.product_id).filter((id): id is string => Boolean(id)));
      if (!ids.size && sale.product_id) ids.add(sale.product_id);
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const productPerformance = normalized.products.filter(p => counts.has(p.id)).map(p => ({ id: p.id, name: p.name, image: p.image, sales: counts.get(p.id)!, revenueNet: null }));
    // These scopes do not expose settlement fees, storefront sessions, or customer identity.
    return NextResponse.json({ store: { name: normalized.storeName, platform: "shopify", status: store.connection_status, connectedAt: store.connected_at ?? null }, snapshot: { ...normalized, coverage: snapshot.coverage, persistenceError, overview: overview ? { ...overview, revenueNet: null, previousRevenueNet: null, revenueChangePct: null, averageBasket: null, customers: null, repeatRate: null, abandonmentRate: null, customerValue: null, maxCostPerCustomer: null } : null, productPerformance, capabilities: { sessions: false, conversionRate: false, settlementNet: false, customerRecovery: false }, limitations: [historicalLimit, "Chiffre d’affaires après remboursements, avant frais Shopify. Net de règlement et bénéfices inconnus.", "Les visites, les frais de règlement et les coordonnées clients ne sont pas importés."] } });
  } catch (error) {
    const expired = /401|expired|expiré|reconnect/i.test(error instanceof Error ? error.message : "");
    return NextResponse.json({ error: expired ? "La connexion Shopify doit être réautorisée." : "Les données Shopify sont indisponibles. Vérifie les autorisations de l’application et réessaie.", code: expired ? "SHOPIFY_EXPIRED" : "SHOPIFY_UNAVAILABLE" }, { status: expired ? 401 : 502 });
  }
}
