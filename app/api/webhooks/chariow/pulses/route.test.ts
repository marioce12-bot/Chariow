import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ notify: vi.fn(), signature: vi.fn(), inserts: [] as unknown[], upserts: [] as unknown[], deletes: [] as string[], filters: [] as unknown[], eventError: null as any, saleError: null as any, storeError: null as any, store: null as any }));
vi.mock("@/lib/chariow/sale-notifications", () => ({ notifyChariowSales: m.notify }));
vi.mock("@/lib/attribution-server", () => ({ verifyChariowSignature: m.signature }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => ({
  insert: async (row: unknown) => { m.inserts.push(row); return { error: m.eventError }; },
  upsert: async (row: unknown) => { m.upserts.push(row); return { error: m.saleError }; },
  delete: () => ({ eq: async (_: string, id: string) => { m.deletes.push(id); return { error: null }; } }),
  select: () => { const q = { eq: (key: string, value: unknown) => { m.filters.push([table, key, value]); return q; }, maybeSingle: async () => ({ data: m.store, error: m.storeError }) }; return q; },
}) }) }));
import { POST } from "./route";
const event = (overrides: Record<string, unknown> = {}) => ({ id: "event-1", type: "successful.sale", data: { id: "sale-1", status: "completed", created_at: "2026-10-22T00:00:00Z", custom_metadata: { store_id: "store-1", user_id: "forged-user" } }, ...overrides });
const request = (body: unknown = event(), delivery = true) => new Request("https://vendeo-studio.site/api/webhooks/chariow/pulses", { method: "POST", headers: { "x-chariow-signature": "valid", ...(delivery ? { "x-pulse-delivery-id": "delivery-1" } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); m.inserts = []; m.upserts = []; m.deletes = []; m.filters = []; m.eventError = null; m.saleError = null; m.storeError = null;
  m.store = { id: "store-1", user_id: "owner-1", store_name: "Store", connected_at: "2026-01-01T00:00:00Z" };
  m.signature.mockReturnValue(true); m.notify.mockResolvedValue(undefined);
});
describe("Chariow sale notification webhook", () => {
  it("notifies only the owner resolved from the active connected store", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(m.notify).toHaveBeenCalledWith(m.store, [expect.objectContaining({ id: "sale-1", status: "completed" })]);
    expect(m.filters).toContainEqual(["stores", "connection_status", "connected"]);
    expect(m.notify.mock.calls[0][0].user_id).toBe("owner-1");
  });
  it("resolves native Chariow store identifiers before persisting and notifying", async () => {
    await POST(request(event({ data: { id: "sale-2", store_id: "native-store-7", status: "paid", created_at: "2026-10-22T00:00:00Z" } })));
    expect(m.filters).toContainEqual(["stores", "chariow_store_id", "native-store-7"]);
    expect(m.upserts[0]).toMatchObject({ store_id: "store-1" });
    expect(m.notify).toHaveBeenCalledWith(m.store, expect.any(Array));
  });
  it("leaves a lookup failure retryable even if its event was already recorded", async () => {
    m.storeError = { message: "database unavailable" };
    expect((await POST(request())).status).toBe(500);
    expect(m.notify).not.toHaveBeenCalled();
    m.storeError = null; m.eventError = { code: "23505" };
    expect((await POST(request())).status).toBe(200);
    expect(m.notify).toHaveBeenCalledTimes(1);
  });
  it("ignores signed test pulses without persisting or notifying", async () => {
    expect(await (await POST(request(event(), false))).json()).toEqual({ received: true, test: true });
    expect(m.inserts).toHaveLength(0); expect(m.upserts).toHaveLength(0); expect(m.notify).not.toHaveBeenCalled();
  });
  it("reprocesses duplicate delivery through the shared sale dedupe service", async () => {
    m.eventError = { code: "23505" };
    expect(await (await POST(request())).json()).toEqual({ received: true, duplicate: true });
    expect(m.notify).toHaveBeenCalledTimes(1);
  });
  it("does not notify failed events or unknown stores", async () => {
    await POST(request(event({ type: "failed.sale" })));
    expect(m.notify).not.toHaveBeenCalled();
    m.store = null; await POST(request()); expect(m.notify).not.toHaveBeenCalled();
  });
  it("uses successful.sale as confirmation only if sale status is missing", async () => {
    await POST(request(event({ data: { id: "sale-2", store_id: "store-1", created_at: "2026-10-22T00:00:00Z" } })));
    expect(m.notify).toHaveBeenCalledWith(m.store, [expect.objectContaining({ status: "paid" })]);
    m.notify.mockClear();
    await POST(request(event({ data: { id: "sale-2", store_id: "store-1", status: "refunded" } })));
    expect(m.notify).toHaveBeenCalledWith(m.store, [expect.objectContaining({ status: "refunded" })]);
  });
  it("returns a retryable response when notification persistence fails", async () => {
    m.notify.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request())).status).toBe(500); expect(m.deletes).toEqual(["event-1"]);
  });
  it("does not notify a sale that could not be persisted", async () => {
    m.saleError = { message: "database unavailable" };
    expect((await POST(request())).status).toBe(500); expect(m.notify).not.toHaveBeenCalled();
  });
  it("rejects invalid production signatures before database access", async () => {
    vi.stubEnv("NODE_ENV", "production"); m.signature.mockReturnValue(false);
    try { expect((await POST(request())).status).toBe(401); expect(m.inserts).toHaveLength(0); } finally { vi.unstubAllEnvs(); }
  });
});
