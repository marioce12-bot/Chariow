import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cachedProducts: vi.fn(), requireUser: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/shop/products", () => ({ getCachedStoreProducts: mocks.cachedProducts }));

import { GET } from "@/app/api/market/radar/catalog/route";

function makeSupabase() {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = mocks.maybeSingle;
  return { from: vi.fn(() => query) };
}

function request(storeId = "store-1") {
  return new Request(`http://localhost/api/market/radar/catalog?store_id=${encodeURIComponent(storeId)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cachedProducts.mockResolvedValue([]);
  mocks.maybeSingle.mockResolvedValue({ data: { id: "store-1", platform: "chariow", store_name: "Ma boutique", connection_status: "connected" }, error: null });
  mocks.requireUser.mockResolvedValue({ supabase: makeSupabase(), user: { id: "user-1" }, response: new Response(null, { status: 401 }) });
});

describe("GET /api/market/radar/catalog", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({ supabase: {}, user: null, response: new Response("Unauthorized", { status: 401 }) });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.cachedProducts).not.toHaveBeenCalled();
  });

  it("does not load products for a store that is not an owned connected Chariow store", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "store-1", platform: "shopify", store_name: "Shopify", connection_status: "connected" }, error: null });
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(mocks.cachedProducts).not.toHaveBeenCalled();
  });

  it("returns only catalog fields, without analytics or sales", async () => {
    mocks.cachedProducts.mockResolvedValue([{
      id: "product-1", name: "Guide budget", description: "Guide pratique", price: 4500, currency: "XOF", image: "https://example.test/cover.jpg", url: "https://example.test/guide",
    }]);
    const response = await GET(request());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.store).toEqual({ id: "store-1", name: "Ma boutique" });
    expect(data.products).toEqual([{
      id: "product-1", name: "Guide budget", description: "Guide pratique", price: 4500, currency: "XOF", image: "https://example.test/cover.jpg", url: "https://example.test/guide",
    }]);
    expect(JSON.stringify(data)).not.toContain("sales");
    expect(mocks.cachedProducts).toHaveBeenCalledWith("store-1");
  });
});
