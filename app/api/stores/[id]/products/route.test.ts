import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), fetchStoreProducts: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/shop/products", () => ({ fetchStoreProducts: mocks.fetchStoreProducts }));

import { GET } from "@/app/api/stores/[id]/products/route";

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const request = () => new Request("https://preview.test/api/stores/store-1/products");
const context = { params: Promise.resolve({ id: "store-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: "store-1" }, error: null });
  const supabase = { from: vi.fn(() => query) };
  mocks.requireUser.mockResolvedValue({ user: { id: "owner" }, supabase });
  mocks.fetchStoreProducts.mockResolvedValue([
    { id: "product-1", name: "Portfolio", description: "Description à jour", price: 0, currency: "XOF", image: null, url: null },
  ]);
});

describe("GET /api/stores/[id]/products", () => {
  it("lit le catalogue complet utile au Studio sans exposer les ventes", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.fetchStoreProducts).toHaveBeenCalledWith("store-1", 3_000);
    const body = await response.json();
    expect(body.products).toEqual([expect.objectContaining({ id: "product-1", description: "Description à jour" })]);
    expect(body).not.toHaveProperty("sales");
    expect(query.eq.mock.calls).toEqual([["id", "store-1"], ["user_id", "owner"], ["is_active", true]]);
  });

  it("refuse une boutique qui n’appartient pas à l’utilisateur sans appeler Chariow", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.fetchStoreProducts).not.toHaveBeenCalled();
  });

  it("retourne l’erreur d’authentification sans lecture catalogue", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mocks.requireUser.mockResolvedValue({ user: null, response: unauthorized });
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mocks.fetchStoreProducts).not.toHaveBeenCalled();
  });
});
