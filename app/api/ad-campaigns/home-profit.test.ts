import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
import { GET } from "./route";

describe("historique des campagnes pour le bénéfice", () => {
  it("lit toutes les pages pour la boutique et l’utilisateur, y compris les campagnes supprimées", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), status: "deleted" }));
    const requests: Array<{ filters: Array<[string, unknown]>; range: [number, number] }> = [];
    const supabase = { from: () => {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: () => query,
        range: async (from: number, to: number) => {
          requests.push({ filters: [...filters], range: [from, to] });
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return query;
    } };
    mocks.requireUser.mockResolvedValue({ user: { id: "u1" }, supabase, response: null });
    const response = await GET(new Request("http://localhost/api/ad-campaigns?store_id=store-1&include_history=1"));
    expect(response.status).toBe(200);
    expect((await response.json()).campaigns).toHaveLength(1001);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.filters.some(([key, value]) => key === "user_id" && value === "u1") && request.filters.some(([key, value]) => key === "store_id" && value === "store-1"))).toBe(true);
    expect((await GET(new Request("http://localhost/api/ad-campaigns?include_history=1"))).status).toBe(400);
  });
});
