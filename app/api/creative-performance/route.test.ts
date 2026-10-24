import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), load: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/creative-performance/service", () => ({ loadCreativePerformance: mocks.load, parseCreativePeriod: mocks.parse }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: "store-1" }, error: null }) };
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: () => query } });
  mocks.parse.mockReturnValue({ from: "2026-09-25", to: "2026-10-24" });
  mocks.load.mockResolvedValue({ media: [], campaigns: [], productEligibility: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("creative-performance read-only guard", () => {
  it("never persists report snapshots in a Preview deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await GET(new Request("https://preview.example/api/creative-performance?store_id=store-1"));
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ persistSnapshots: false }));
  });

  it("supports an explicit read-only request without changing production defaults", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await GET(new Request("https://example.com/api/creative-performance?store_id=store-1&read_only=1"));
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({ persistSnapshots: false }));
    await GET(new Request("https://example.com/api/creative-performance?store_id=store-1"));
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({ persistSnapshots: true }));
  });
});
