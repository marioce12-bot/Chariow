import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
  loadAds: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/product-ad-data", () => ({ loadProductAdData: mocks.loadAds }));
import { GET, PUT } from "@/app/api/product-profit/route";
let q: any;
beforeEach(() => {
  vi.clearAllMocks();
  q = {
    select: vi.fn(() => q),
    eq: mocks.eq,
    order: vi.fn(() => q),
    gte: vi.fn(() => q),
    lte: vi.fn(() => q),
    single: mocks.single,
    upsert: mocks.upsert,
    range: mocks.range,
  };
  mocks.eq.mockImplementation(() => q);
  mocks.upsert.mockImplementation(() => q);
  mocks.from.mockReturnValue(q);
  mocks.single.mockResolvedValue({ data: { id: "store", sales_last_sync_complete: true, sales_last_synced_at: new Date().toISOString() }, error: null });
  mocks.range.mockResolvedValue({ data: [], error: null });
  mocks.loadAds.mockResolvedValue({ data: { products: [], campaigns: [], links: [], accounts: [], insights: [], since: "2026-10-15", until: "2026-10-21" }, status: "available", errors: [] });
  mocks.requireUser.mockResolvedValue({
    user: { id: "owner" },
    supabase: { from: mocks.from },
  });
});
const req = (body: unknown) =>
  new Request("http://localhost/api/product-profit", {
    method: "PUT",
    body: JSON.stringify(body),
  });
const body = {
  storeId: "store",
  productId: "ebook",
  currency: "USD",
  unitCost: 1.1,
  feePerSale: 1.15,
};
describe("Product profit API", () => {
  it("requires authentication for reads and writes", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response("Unauthorized", { status: 401 }),
    });
    expect(
      (
        await GET(
          new Request("http://localhost/api/product-profit?storeId=store"),
        )
      ).status,
    ).toBe(401);
    expect((await PUT(req(body))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("prevents reading or writing another owner's store", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect(
      (
        await GET(
          new Request("http://localhost/api/product-profit?storeId=store"),
        )
      ).status,
    ).toBe(404);
    expect((await PUT(req(body))).status).toBe(404);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("defaults omitted ebook manufacturing and optional other fees to zero", async () => {
    expect((await PUT(req({ storeId: "store", productId: "ebook", currency: "XOF" }))).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ unit_cost: 0, fee_per_sale: 0 }),
      expect.anything(),
    );
  });
  it.each([1.1, 1.15, 2.55, 0])(
    "accepts the valid monetary value %s including explicit zero",
    async (value) => {
      expect((await PUT(req({ ...body, unitCost: value }))).status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ unit_cost: value, fee_per_sale: 1.15 }),
        expect.anything(),
      );
    },
  );
  it.each([-1, 0.001, 1.111, 1000000000000, "1.10", null])(
    "rejects invalid monetary value %s",
    async (value) => {
      expect((await PUT(req({ ...body, unitCost: value }))).status).toBe(400);
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );
  it("returns invalid-period errors without reading private rows", async () => {
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/product-profit?storeId=store&period=999",
          ),
        )
      ).status,
    ).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});


describe("Product profit stored advertising integration", () => {
  const url = "http://localhost/api/product-profit?storeId=store&period=7";
  const fixture = () => {
    const now = new Date();
    const until = now.toISOString().slice(0, 10);
    const start = new Date(`${until}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 6);
    const since = start.toISOString().slice(0, 10);
    return { products: [{ id: "ebook" }], campaigns: [{ id: "c", productId: "ebook", metaCampaignId: "m", accountId: "a" }], links: [],
      accounts: [{ id: "a", currency: "USD", lastSyncedAt: now.toISOString(), syncComplete: true, syncedFrom: since, syncedTo: until }],
      insights: Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i); const day = d.toISOString().slice(0, 10); return { accountId: "a", entityId: "m", level: "campaign", dateStart: day, dateStop: day, spend: 2, conversions: 1, conversionValue: 20 }; }), since, until };
  };
  const sales = [{ product_id: "ebook", amount: 100, net_amount: 85, currency: "USD", status: "paid", raw_payload: {} }];
  it("subtracts linked spend once from net already after fees within the same UTC period", async () => {
    mocks.range.mockResolvedValue({ data: sales, error: null });
    mocks.loadAds.mockResolvedValue({ data: fixture(), status: "available", errors: [] });
    const res = await GET(new Request(url)); const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.products[0]).toMatchObject({ netRevenue: 85, chariowFees: 15, adSpend: 14, profit: 71, metaPurchases: 7, provenance: { campaignLinkedSales: 0 } });
    expect(mocks.loadAds).toHaveBeenCalledWith(expect.anything(), "owner", "store", json.since.slice(0, 10), json.until.slice(0, 10), expect.arrayContaining([expect.objectContaining({ productId: "ebook" })]));
    expect(json.since).toMatch(/T00:00:00.000Z$/);
    expect(mocks.eq).toHaveBeenCalledWith("store_id", "store");
  });
  it("keeps net visible but never presents missing Meta data as zero", async () => {
    mocks.range.mockResolvedValue({ data: sales, error: null });
    mocks.loadAds.mockResolvedValue({ data: fixture(), status: "unavailable", errors: ["read failed"] });
    const json = await (await GET(new Request(url))).json();
    expect(json.products[0]).toMatchObject({ netRevenue: 85, profit: null, adSpend: null, metaPurchases: null, adSpendStatus: "unavailable" });
    expect(JSON.stringify(json)).not.toContain("read failed");
  });
  it("does not claim complete profit with stale or incomplete Chariow sync", async () => {
    mocks.single.mockResolvedValue({ data: { id: "store", sales_last_sync_complete: false }, error: null });
    mocks.range.mockResolvedValue({ data: sales, error: null });
    mocks.loadAds.mockResolvedValue({ data: fixture(), status: "available", errors: [] });
    const json = await (await GET(new Request(url))).json();
    expect(json.products[0]).toMatchObject({ netRevenue: 85, adSpend: 14, profit: null });
  });
});
