import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ calls: [] as string[], client: null as any }));
vi.mock("./mcp-client", () => ({
  ChariowMcpClient: class {
    constructor() { mocks.client = this; }
    async initialize() { mocks.calls.push("initialize"); }
    async callTool(name: string) {
      mocks.calls.push(name);
      if (name === "get_store") return { data: { name: "Shop" } };
      if (name === "list_products") return { data: [{ id: "p1", name: "Product" }] };
      if (name === "list_sales") return { data: [] };
      return {};
    }
  },
}));
vi.mock("./pagination", () => ({
  collectChariowPages: async (call: (args: Record<string, unknown>) => Promise<unknown>) => {
    const result = await call({});
    const row = result as { data?: unknown[] };
    return { data: row.data ?? [], coverage: { complete: true, fetched: row.data?.length ?? 0, pages: 1, reason: null } };
  },
}));
import { getChariowSnapshot, type ChariowRequestShared } from "./analytics";

beforeEach(() => { mocks.calls.length = 0; mocks.client = null; });

describe("Chariow bundled snapshots", () => {
  it("shares initialization and catalogue requests without sharing period analytics or sales", async () => {
    const shared: ChariowRequestShared = {};
    const store = { mcp_url: "mock://shop", access_token_encrypted: null };
    const [month, rolling] = await Promise.all([
      getChariowSnapshot(store, { from: "2026-10-01", to: "2026-10-31" }, shared),
      getChariowSnapshot(store, { from: "2026-10-02", to: "2026-10-31" }, shared),
    ]);
    expect(mocks.calls.filter((name) => name === "initialize")).toHaveLength(1);
    expect(mocks.calls.filter((name) => name === "get_store")).toHaveLength(1);
    expect(mocks.calls.filter((name) => name === "list_products")).toHaveLength(1);
    expect(mocks.calls.filter((name) => name === "list_sales")).toHaveLength(2);
    expect(mocks.calls.filter((name) => name === "get_sales_analytics")).toHaveLength(2);
    expect(mocks.calls.filter((name) => name === "get_store_analytics")).toHaveLength(2);
    expect(month.products).toEqual(rolling.products);
    expect(mocks.calls).toContain("get_store_analytics");
  });
});
