import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
const state = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), failRead: false, calls: [] as any[], sales: [] as any[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));
vi.mock("@/lib/shopify/sync", () => ({ syncShopifyStore: vi.fn() }));
import { POST } from "./route";
import { requestedOrderIds } from "@/lib/shopify/privacy-requests";
const shop = "fixture.myshopify.com";
const stores = [
  { id: "a", platform: "shopify", shop_domain: shop },
  { id: "b", platform: "shopify", shop_domain: shop },
  { id: "other", platform: "shopify", shop_domain: "other.myshopify.com" },
  { id: "legacy", platform: "chariow", shop_domain: shop },
];
const secret = "test-only-webhook-secret-more-than-32";
async function send(topic: string, payload: unknown, valid = true) {
  const raw = JSON.stringify({ shop_domain: shop, ...(payload as Record<string, unknown>) });
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  return POST(new Request("https://example.test/api/webhooks/shopify", { method: "POST", body: raw, headers: { "x-shopify-topic": topic, "x-shopify-shop-domain": shop, "x-shopify-hmac-sha256": valid ? signature : "bad" } }));
}
beforeEach(() => {
  process.env.SHOPIFY_CLIENT_SECRET = secret;
  state.failRead = false; state.calls = []; state.admin.mockClear();
  state.sales = [
    { store_id: "a", chariow_sale_id: "shopify:a:42", amount: 12 },
    { store_id: "a", chariow_sale_id: "shopify:a:43", amount: 13 },
    { store_id: "b", chariow_sale_id: "shopify:b:42", amount: 14 },
    { store_id: "other", chariow_sale_id: "shopify:other:42", amount: 15 },
    { store_id: "a", chariow_sale_id: "42", amount: 16 },
  ];
  state.rpc.mockReset().mockResolvedValue({ data: 2, error: null });
  state.admin.mockImplementation(() => ({ rpc: state.rpc, from(table: string) {
    const filters: Record<string, any> = {}; let keys: string[] | undefined;
    const chain: any = {
      select(columns: string) { state.calls.push({ table, columns, filters }); return chain; },
      eq(key: string, value: any) { filters[key] = value; return chain; },
      in(_key: string, values: string[]) { keys = values; return chain; },
      order() { return chain; },
      range(start: number, end: number) {
        const rows = table === "stores" ? stores : state.sales;
        return Promise.resolve({ data: rows.filter(row => Object.entries(filters).every(([k, v]) => (row as any)[k] === v) && (!keys || keys.includes((row as any).chariow_sale_id))).slice(start, end + 1), error: table !== "stores" && state.failRead ? { message: "failure" } : null });
      },
    }; return chain;
  } }));
});
afterEach(() => { delete process.env.SHOPIFY_CLIENT_SECRET; });
describe("Shopify customer privacy requests", () => {
  it("exports only explicitly requested orders for every matching Shopify store", async () => {
    const response = await send("customers/data_request", { shop_domain: shop, orders_requested: [42], customer: { id: 999 } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).orders.map((row: any) => row.chariow_sale_id)).toEqual(["shopify:a:42", "shopify:b:42"]);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.calls.filter(c => c.table === "chariow_sales").every(c => c.filters.store_id === "a" || c.filters.store_id === "b")).toBe(true);
  });
  it("redacts through the atomic tombstone transaction scoped to the signed shop", async () => {
    const response = await send("customers/redact", { shop_domain: shop, orders_to_redact: [42, "42", "gid://shopify/Order/43"] });
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("redact_shopify_orders", { p_shop_domain: shop, p_order_ids: ["42", "43"] });
  });
  it("does not acknowledge database failures as successful erasure or export", async () => {
    state.rpc.mockResolvedValue({ error: { message: "temporary" } });
    expect((await send("customers/redact", { orders_to_redact: [42] })).status).toBe(503);
    state.failRead = true;
    expect((await send("customers/data_request", { orders_requested: [42] })).status).toBe(503);
  });
  it("requires a valid signature before touching storage", async () => {
    expect((await send("customers/redact", { orders_to_redact: [42] }, false)).status).toBe(401);
    expect(state.admin).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { shop_domain: "other.myshopify.com", orders_to_redact: [42] },
    { orders_to_redact: [Number.MAX_SAFE_INTEGER + 1] },
    { orders_to_redact: ["42%"] },
    { orders_to_redact: [null] },
    {},
    { shop_domain: undefined, orders_to_redact: [42] },
  ])("rejects invalid or cross-shop payload %j", async payload => {
    expect((await send("customers/redact", payload)).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("accepts empty lists without deleting everything", async () => {
    expect((await send("customers/redact", { orders_to_redact: [] })).status).toBe(200);
    expect(state.rpc).not.toHaveBeenCalled();
    const response = await send("customers/data_request", { orders_requested: [] });
    expect((await response.json()).orders).toEqual([]);
  });
  it("preserves large IDs supplied as strings and rejects invalid order types", () => {
    expect(requestedOrderIds({ shop_domain: shop, orders_requested: ["9007199254740993"] }, "orders_requested", shop)).toEqual(["9007199254740993"]);
    expect(() => requestedOrderIds({ shop_domain: shop, orders_requested: ["gid://shopify/Customer/42"] }, "orders_requested", shop)).toThrow();
  });
});
