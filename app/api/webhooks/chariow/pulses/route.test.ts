import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  notify: vi.fn(), invalidate: vi.fn(), invalidateProducts: vi.fn(), invalidateStoreList: vi.fn(), events: new Map<string, any>(), sales: new Map<string, any>(), signals: new Map<string, any>(),
  signalInserts: 0, filters: [] as any[], upserts: [] as any[], deletes: [] as string[], steps: [] as string[],
  eventError: null as any, saleError: null as any, signalError: null as any, storeError: null as any, store: null as any,
}));
vi.mock("@/lib/chariow/sale-notifications", () => ({ notifyChariowSales: m.notify }));
vi.mock("@/lib/chariow/analytics-cache", () => ({ invalidateChariowAnalytics: m.invalidate }));
vi.mock("@/lib/shop/products", () => ({ invalidateCachedStoreProducts: m.invalidateProducts }));
vi.mock("@/lib/shop/cache", () => ({ invalidateUserStoreList: m.invalidateStoreList }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => ({
  insert: async (row: any) => {
    if (m.eventError) return { error: m.eventError };
    if (m.events.has(row.event_id)) return { error: { code: "23505" } };
    m.events.set(row.event_id, row); return { error: null };
  },
  upsert: async (row: any, options: any) => {
    m.upserts.push({ table, row, options });
    if (table === "chariow_sales") { m.steps.push("sale"); if (!m.saleError) m.sales.set(row.chariow_sale_id, row); return { error: m.saleError }; }
    if (table === "sales_events") {
      m.steps.push("signal"); if (m.signalError) return { error: m.signalError };
      const key = `${row.store_id}:${row.event_id}`;
      if (!m.signals.has(key)) { m.signals.set(key, row); m.signalInserts++; }
    }
    return { error: null };
  },
  delete: () => ({ eq: async (_key: string, id: string) => { m.events.delete(id); m.deletes.push(id); return { error: null }; } }),
  select: () => { const query = { eq: (key: string, value: unknown) => { m.filters.push([table, key, value]); return query; }, maybeSingle: async () => ({ data: m.store, error: m.storeError }) }; return query; },
}) }) }));
import { POST } from "./route";
const fixtureSecret = "local-webhook-test-fixture-not-live";
const event = (overrides: Record<string, unknown> = {}) => ({ id: "event-1", type: "successful.sale", created_at: "2026-11-01T08:00:00Z", data: { id: "sale-1", status: "paid", amount: { value: 42, currency: "EUR" }, custom_metadata: { store_id: "store-1", user_id: "forged-user" } }, ...overrides });
const sign = (body: string) => crypto.createHmac("sha256", fixtureSecret).update(body).digest("hex");
function request(body: unknown = event(), options: { delivery?: boolean; signature?: string | null; raw?: string } = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const signature = options.signature === undefined ? sign(raw) : options.signature;
  return new Request("https://example.invalid/api/webhooks/chariow/pulses", { method: "POST", headers: { ...(signature ? { "x-chariow-signature": `sha256=${signature}` } : {}), ...(options.delivery !== false ? { "x-pulse-delivery-id": "delivery-1" } : {}) }, body: raw });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CHARIOW_PULSE_WEBHOOK_SECRET", fixtureSecret);
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.events = new Map(); m.sales = new Map(); m.signals = new Map(); m.signalInserts = 0; m.filters = []; m.upserts = []; m.deletes = []; m.steps = [];
  m.eventError = null; m.saleError = null; m.signalError = null; m.storeError = null;
  m.store = { id: "store-1", user_id: "owner-1", store_name: "Fixture store", chariow_store_id: "native-1" };
  m.notify.mockImplementation(async () => { m.steps.push("notify"); });
  m.invalidate.mockImplementation(() => { m.steps.push("invalidate"); });
  m.invalidateProducts.mockImplementation(() => { m.steps.push("products"); });
  m.invalidateStoreList.mockImplementation(() => { m.steps.push("stores"); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Signed Chariow sale webhook", () => {
  it("publishes only trusted minimal data after persisting the sale and invalidating cache", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(m.invalidate).toHaveBeenCalledWith("store-1");
    expect(m.steps).toEqual(["sale", "notify", "invalidate", "products", "stores", "signal"]);
    expect(m.invalidateProducts).toHaveBeenCalledWith("store-1");
    expect(m.invalidateStoreList).toHaveBeenCalledWith("owner-1");
    expect(m.signals.get("store-1:event-1")).toEqual({ event_id: "event-1", store_id: "store-1", user_id: "owner-1", status: "paid", amount: 42, currency: "EUR", product_id: null, product_name: null, created_at: "2026-11-01T08:00:00.000Z" });
    expect(m.upserts.find(value => value.table === "sales_events").options).toEqual({ onConflict: "store_id,event_id", ignoreDuplicates: true });
    expect(m.events.get("event-1")).toEqual({ event_id: "event-1", store_id: "store-1", user_id: "owner-1", status: "paid", amount: 42, currency: "EUR", product_id: null, product_name: null });
    expect(m.upserts.find(value => value.table === "chariow_sales").row.raw_payload).toEqual({ event_id: "event-1", store_id: "store-1", user_id: "owner-1", status: "paid", amount: 42, currency: "EUR", product_id: null, product_name: null, created_at: "2026-11-01T08:00:00.000Z" });
    expect(m.notify.mock.calls[0][0].user_id).toBe("owner-1");
    expect(m.filters).toContainEqual(["stores", "is_active", true]);
    expect(m.filters).toContainEqual(["stores", "connection_status", "connected"]);
  });
  it("never persists contact, address, IP, or secret-like fields from a signed provider payload", async () => {
    const hostile = event({ id: "event-private", data: {
      id: "sale-private", status: "paid", amount: { value: 42, currency: "EUR" }, created_at: "2026-11-01T08:00:00Z",
      product_id: "product-safe", product_name: "Produit sûr", custom_metadata: { store_id: "store-1", user_id: "forged-user", api_key: "secret-value" },
      customer: { id: "customer-private", name: "Nom privé", email: "personne@example.invalid", phone: "+22960000000", address: "Adresse privée" },
      ip_address: "203.0.113.1", access_token: "token-private",
    } });
    expect((await POST(request(hostile))).status).toBe(200);
    const signal = m.signals.get("store-1:event-private");
    const sale = m.upserts.find(value => value.table === "chariow_sales").row;
    expect(signal).toEqual({ event_id: "event-private", store_id: "store-1", user_id: "owner-1", status: "paid", amount: 42, currency: "EUR", product_id: "product-safe", product_name: "Produit sûr", created_at: "2026-11-01T08:00:00.000Z" });
    expect(sale.raw_payload).toEqual(signal);
    expect(JSON.stringify([m.events.get("event-private"), signal, sale.raw_payload])).not.toMatch(/Nom privé|personne@example|\+22960000000|Adresse privée|203\.0\.113\.1|token-private|secret-value|customer-private|forged-user/);
  });
  it.each([null, "0".repeat(64)])("rejects unsigned or invalidly signed events in development before database writes", async signature => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await POST(request(event(), { signature }))).status).toBe(401);
    expect(m.events.size).toBe(0); expect(m.sales.size).toBe(0); expect(m.filters).toHaveLength(0);
  });
  it("rejects a body changed after signing", async () => {
    expect((await POST(request(event({ id: "tampered" }), { signature: sign(JSON.stringify(event())) }))).status).toBe(401);
    expect(m.events.size).toBe(0);
  });
  it.each([null, [], "invalid-json"])("rejects malformed signed payloads with a 400", async body => {
    const options = body === "invalid-json" ? { raw: "{" } : {};
    expect((await POST(request(body, options))).status).toBe(400);
    expect(m.events.size).toBe(0);
  });
  it("does not persist or notify a signed provider test pulse without a delivery ID", async () => {
    expect(await (await POST(request(event(), { delivery: false }))).json()).toEqual({ received: true, test: true });
    expect(m.events.size).toBe(0); expect(m.sales.size).toBe(0); expect(m.signalInserts).toBe(0); expect(m.notify).not.toHaveBeenCalled();
  });
  it("replays idempotently: one sale and exactly one INSERT signal", async () => {
    await POST(request());
    expect(await (await POST(request())).json()).toEqual({ received: true, duplicate: true });
    expect(m.events.size).toBe(1); expect(m.sales.size).toBe(1); expect(m.signals.size).toBe(1); expect(m.signalInserts).toBe(1);
  });
  it("does not persist or publish a sale for an unknown store or conflicting native store", async () => {
    m.store = null; expect((await POST(request())).status).toBe(404);
    expect(m.sales.size).toBe(0); expect(m.signalInserts).toBe(0);
    m.store = { id: "store-1", user_id: "owner-1", chariow_store_id: "different-native" };
    expect((await POST(request(event({ data: { id: "sale-1", store_id: "native-1", custom_metadata: { store_id: "store-1" } } })))).status).toBe(404);
    expect(m.sales.size).toBe(0);
  });
  it("resolves native Chariow IDs and uses successful.sale as paid only when status is missing", async () => {
    const payload = event({ data: { id: "sale-2", store_id: "native-1" } });
    expect((await POST(request(payload))).status).toBe(200);
    expect(m.filters).toContainEqual(["stores", "chariow_store_id", "native-1"]);
    expect(m.sales.get("sale-2")).toMatchObject({ store_id: "store-1", status: "paid", occurred_at: "2026-11-01T08:00:00.000Z" });
    expect(m.signals.get("store-1:event-1").status).toBe("paid");
  });
  it("does not notify failed sale events", async () => {
    expect((await POST(request(event({ type: "failed.sale", data: { id: "sale-1", status: "failed", store_id: "native-1" } })))).status).toBe(200);
    expect(m.notify).not.toHaveBeenCalled(); expect(m.signalInserts).toBe(1);
  });
  it("keeps failures retryable without emitting a premature signal", async () => {
    m.saleError = { message: "fixture failure" };
    expect((await POST(request())).status).toBe(500); expect(m.notify).not.toHaveBeenCalled(); expect(m.signalInserts).toBe(0); expect(m.deletes).toEqual(["event-1"]);
    m.saleError = null; m.signalError = { message: "fixture failure" };
    expect((await POST(request())).status).toBe(500); expect(m.signalInserts).toBe(0);
    m.signalError = null; expect((await POST(request())).status).toBe(200); expect(m.signalInserts).toBe(1);
  });
  it("does not emit a signal when notification persistence or cache invalidation fails", async () => {
    m.notify.mockRejectedValueOnce(new Error("fixture notification failure"));
    expect((await POST(request())).status).toBe(500); expect(m.signalInserts).toBe(0);
    m.invalidate.mockImplementationOnce(() => { throw new Error("fixture cache failure"); });
    expect((await POST(request())).status).toBe(500); expect(m.signalInserts).toBe(0);
  });
});
