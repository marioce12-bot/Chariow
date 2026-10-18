import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchAllPages } from "@/lib/paginated-query";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { assessTrackingQuality } from "@/lib/tracking-quality";

type Sale = { chariow_sale_id: string; product_id: string | null; chariow_campaign_id: string | null; status: string; amount: number | null; net_amount: number | null; currency: string | null };
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  if (!storeId) return NextResponse.json({ error: "Boutique requise" }, { status: 400 });
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  const start = params.get("from") ?? from.toISOString().slice(0, 10);
  const end = params.get("to") ?? to.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return NextResponse.json({ error: "Période invalide" }, { status: 400 });
  const { data: store, error: storeError } = await supabase.from("stores").select("id,sales_last_synced_at,sales_last_sync_complete,sales_sync_error").eq("id", storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (storeError) return NextResponse.json({ error: "État du suivi indisponible" }, { status: 503 });
  if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  const [sales, accounts, mappings, attributions] = await Promise.all([
    fetchAllPages<Sale>((a, b) => supabase.from("chariow_sales").select("chariow_sale_id,product_id,chariow_campaign_id,status,amount,net_amount,currency").eq("store_id", storeId).gte("occurred_at", `${start}T00:00:00Z`).lte("occurred_at", `${end}T23:59:59.999Z`).order("id").range(a, b) as unknown as Promise<{ data: Sale[] | null; error: unknown | null }>),
    supabase.from("meta_ad_accounts").select("id").eq("user_id", user.id).eq("store_id", storeId).eq("is_active", true),
    // A native campaign on a sale alone does not prove which Meta campaign it belongs to.
    fetchAllPages<{ chariow_campaign_id: string }>((a, b) => supabase.from("meta_campaign_mappings").select("chariow_campaign_id").eq("user_id", user.id).eq("store_id", storeId).eq("status", "active").order("id").range(a, b) as unknown as Promise<{ data: { chariow_campaign_id: string }[] | null; error: unknown | null }>),
    fetchAllPages<{ chariow_sale_id: string | null; meta_campaign_id: string | null }>((a, b) => supabase.from("meta_attributions").select("chariow_sale_id,meta_campaign_id").eq("user_id", user.id).eq("store_id", storeId).order("id").range(a, b) as unknown as Promise<{ data: { chariow_sale_id: string | null; meta_campaign_id: string | null }[] | null; error: unknown | null }>),
  ]);
  const accountIds = (accounts.data ?? []).map((a: { id: string }) => a.id);
  const pixels = accountIds.length ? await supabase.from("meta_pixels").select("configured_on_chariow,last_fired_at").eq("user_id", user.id).in("ad_account_id", accountIds) : { data: [], error: null };
  const paid = sales.rows.filter((sale) => isConfirmedChariowSaleStatus(sale.status));
  const attributed = new Set(attributions.rows.filter((row) => row.chariow_sale_id && row.meta_campaign_id).map((row) => row.chariow_sale_id));
  const nativeMapped = new Set(mappings.rows.map((row) => row.chariow_campaign_id));
  const quality = assessTrackingQuality({
    checkedAt: new Date().toISOString(),
    salesComplete: store.sales_last_sync_complete,
    salesSyncedAt: store.sales_last_synced_at,
    salesError: Boolean(sales.error || store.sales_sync_error),
    paidSales: sales.error ? null : paid.length,
    missingProducts: sales.error ? null : paid.filter((s) => !s.product_id).length,
    missingAmounts: sales.error ? null : paid.filter((s) => (s.amount === null && s.net_amount === null) || !s.currency).length,
    unattributedSales: sales.error || attributions.error || mappings.error ? null : paid.filter((s) => !attributed.has(s.chariow_sale_id) && !(s.chariow_campaign_id && nativeMapped.has(s.chariow_campaign_id))).length,
    linkedAccounts: accounts.error ? null : accountIds.length,
    pixelConfigured: pixels.error ? null : (pixels.data ?? []).some((p: { configured_on_chariow: boolean }) => p.configured_on_chariow),
    pixelLastFiredAt: pixels.error ? null : (pixels.data ?? []).map((p: { last_fired_at: string | null }) => p.last_fired_at).filter(Boolean).sort().at(-1) ?? null,
  });
  return NextResponse.json({ quality, period: { from: start, to: end }, mappingCount: mappings.error ? null : mappings.rows.length });
}
