import { describe, expect, it, vi } from "vitest";
import { loadProductAdData } from "./product-ad-data";
import { enrichProductAdProfit } from "./product-ad-profit";

const tables = () => ({
  stores: [{ id: "s", user_id: "u" }],
  ad_campaigns: [{ id: "local", user_id: "u", store_id: "s", platform: "meta", product_id: "p", external_campaign_id: "external", meta_ad_account_id: "a", destination_url: "https://shop.test/p" }],
  campaign_product_links: [] as any[],
  meta_ad_accounts: [{ id: "a", user_id: "u", store_id: "s", is_active: true, currency: "USD", last_synced_at: "2026-10-21T12:00:00Z", insights_sync_complete: true, insights_sync_from: "2026-10-21", insights_sync_to: "2026-10-21", meta_integration_id: "integration" }],
  meta_integrations: [{ id: "integration", user_id: "u", is_active: true, last_error: null as string | null }],
  meta_campaigns: [{ id: "internal", ad_account_id: "a", meta_campaign_id: "external" }],
  meta_insights_daily: [{ ad_account_id: "a", level: "campaign", entity_id: "external", date_start: "2026-10-21", date_stop: "2026-10-21", spend: 10, conversions: 2, conversion_value: 50 }],
});
function client(rows: Record<string, any[]>, failing?: string) {
  const selections: string[] = [];
  const from = vi.fn((table: string) => {
    let filtered = [...(rows[table] ?? [])];
    const q: any = {
      select: (fields: string) => { selections.push(fields); return q; },
      eq: (key: string, value: unknown) => { filtered = filtered.filter(r => r[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filtered = filtered.filter(r => values.includes(r[key])); return q; },
      gte: (key: string, value: string) => { filtered = filtered.filter(r => r[key] >= value); return q; },
      lte: (key: string, value: string) => { filtered = filtered.filter(r => r[key] <= value); return q; },
      order: () => q,
      range: async (a: number, b: number) => ({ data: table === failing ? null : filtered.slice(a, b + 1), error: table === failing ? { message: "unavailable" } : null }),
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    };
    return q;
  });
  return { from, selections };
}
const load = (db: ReturnType<typeof client>) => loadProductAdData(db, "u", "s", "2026-10-21", "2026-10-21", [{ productId: "p" }]);
const calculate = (data: Awaited<ReturnType<typeof load>>["data"]) => enrichProductAdProfit({ ...data, aggregate: [{ productId: "p", currency: "USD", netRevenue: 85, totalCosts: 0 }], now: new Date("2026-10-21T13:00:00Z"), salesComplete: true })[0];

describe("loadProductAdData read-only store scope", () => {
  it("uses existing schemas, avoids historical sales reads and never selects tokens/customer data", async () => {
    const db = client(tables()); const loaded = await load(db);
    expect(loaded.status).toBe("available");
    expect(calculate(loaded.data)).toMatchObject({ adSpend: 10, profit: 75, metaPurchases: 2 });
    expect(db.from.mock.calls.map(([table]) => table)).not.toContain("chariow_products");
    expect(db.from.mock.calls.map(([table]) => table)).not.toContain("chariow_sales");
    expect(db.selections.join(" ")).not.toMatch(/access_token|customer|email|phone|raw_payload/);
  });
  it("rejects another user's store before loading advertising", async () => {
    const rows = tables(); rows.stores[0].user_id = "other"; const db = client(rows);
    expect((await load(db)).status).toBe("unavailable");
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it("keeps explicitly stored campaigns even when the Meta catalogue is missing", async () => {
    const rows = tables(); rows.meta_campaigns = []; const loaded = await load(client(rows));
    expect(loaded.data.campaigns).toHaveLength(1);
    expect(calculate(loaded.data)).toMatchObject({ adSpend: 10, profit: 75 });
  });
  it("preserves conflicting product links even if the second product has no sales", async () => {
    const rows = tables(); rows.campaign_product_links = [{ user_id: "u", meta_campaign_id: "internal", product_id: "second", product_url: "https://shop.test/second" }];
    const loaded = await load(client(rows));
    expect(calculate(loaded.data)).toMatchObject({ adSpend: null, profit: null, adSpendStatus: "ambiguous" });
  });
  it("whitelists this store's campaigns on an indirectly linked ad account", async () => {
    const rows = tables(); rows.meta_ad_accounts[0].store_id = "other-store";
    rows.meta_campaigns.push({ id: "foreign", ad_account_id: "a", meta_campaign_id: "foreign-external" });
    rows.campaign_product_links.push({ user_id: "u", meta_campaign_id: "foreign", product_id: "p", product_url: "https://shop.test/p" });
    const loaded = await load(client(rows));
    expect(loaded.data.campaigns.map(c => c.metaCampaignId)).toEqual(["external"]);
    expect(calculate(loaded.data)).toMatchObject({ adSpend: 10, profit: 75 });
  });
  it("propagates invalidated integration and read failures as unavailable rather than zero", async () => {
    const rows = tables(); rows.meta_integrations[0].last_error = "OAuth revoked";
    expect(calculate((await load(client(rows))).data)).toMatchObject({ adSpend: null, profit: null, metaPurchases: null });
    const failed = await load(client(tables(), "meta_insights_daily"));
    expect(failed.status).not.toBe("available");
    expect(calculate(failed.data)).toMatchObject({ adSpend: null, profit: null, metaPurchases: null });
  });
});
