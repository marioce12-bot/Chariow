import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), load: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chariow/geography", () => ({ getChariowGeography: mocks.load }));
import { GET } from "./route";
let query: any;
beforeEach(() => {
  vi.clearAllMocks();
  query = { select: vi.fn(() => query), eq: vi.fn((...args) => { mocks.eq(...args); return query; }), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "store-1", platform: "chariow", connection_status: "connected", mcp_url: "https://mock.invalid/mcp", access_token_encrypted: null }, error: null }) };
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: vi.fn(() => query) } });
  mocks.load.mockResolvedValue({ period: { from: "2026-10-01", to: "2026-10-24" }, visitsByLocation: [], salesByCountry: null, conversionByCountry: null });
});
const request = (suffix = "") => new Request(`https://example.invalid/api/ad-performance/geography${suffix}`);
describe("GET /api/ad-performance/geography", () => {
  it("requires auth and does not query a store for anonymous requests", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(request("?store_id=store-1"))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("scopes lookup to the authenticated owner and active store", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await GET(request("?store_id=foreign"))).status).toBe(404);
    expect(mocks.eq).toHaveBeenCalledWith("id", "foreign");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("requires connected Chariow store and returns normalized analytics", async () => {
    const response = await GET(request("?store_id=store-1&from=2026-10-01&to=2026-10-24"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visitsByLocation: [], salesByCountry: null, conversionByCountry: null });
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ id: "store-1" }), { from: "2026-10-01", to: "2026-10-24" });
  });
  it("rejects invalid periods before store lookup", async () => {
    expect((await GET(request("?store_id=store-1&from=2026-11-01&to=2026-10-01"))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(query.maybeSingle).not.toHaveBeenCalled();
  });
  it("refuses disconnected stores", async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: "store-1", platform: "chariow", connection_status: "expired", mcp_url: "https://mock.invalid" }, error: null });
    expect((await GET(request("?store_id=store-1"))).status).toBe(409);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
