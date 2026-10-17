import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
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
  mocks.single.mockResolvedValue({ data: { id: "store" }, error: null });
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
