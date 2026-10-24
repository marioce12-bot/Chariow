import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptSecret: vi.fn(() => "decrypted-token"),
  initialize: vi.fn(),
  callTool: vi.fn(),
  options: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("./mcp-client", () => ({
  ChariowMcpClient: class {
    constructor(options: Record<string, unknown>) { mocks.options = options; }
    initialize() { return mocks.initialize(); }
    callTool(name: string, args: Record<string, unknown>) { return mocks.callTool(name, args); }
  },
}));

import { getChariowGeography } from "./geography";

const period = { from: "2026-10-01", to: "2026-10-24" };

describe("getChariowGeography MCP contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options = null;
    mocks.initialize.mockResolvedValue({});
    mocks.callTool
      .mockResolvedValueOnce({ locations: [{ location: "Cotonou", visits: 17 }] })
      .mockResolvedValueOnce({ by_country: [{ country: "BJ", sales: 3, revenue: 120, currency: "XOF" }] })
      .mockResolvedValueOnce({ by_country: [{ country: "BJ", visits: 17, conversions: 3, conversion_rate: "0.176" }] });
  });

  it("requests only documented geography sections and keeps traffic, sales and conversion separate", async () => {
    const result = await getChariowGeography({ mcp_url: "https://chariow.example/mcp", access_token_encrypted: "encrypted" }, period);
    expect(mocks.options).toEqual({ endpoint: "https://chariow.example/mcp", accessToken: "decrypted-token" });
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.callTool).toHaveBeenNthCalledWith(1, "get_visits_analytics", { ...period, sections: ["locations"] });
    expect(mocks.callTool).toHaveBeenNthCalledWith(2, "get_sales_analytics", { ...period, sections: ["by_country"] });
    expect(mocks.callTool).toHaveBeenNthCalledWith(3, "get_conversion_rate_analytics", { ...period, sections: ["by_country"] });
    expect(result.visitsByLocation).toEqual([{ location: "Cotonou", visits: 17 }]);
    expect(result.salesByCountry).toEqual([{ country: "BJ", sales: 3, revenue: 120, currency: "XOF" }]);
    expect(result.conversionByCountry).toEqual([{ country: "BJ", visits: 17, sales: 3, rate: 0.176 }]);
  });

  it("does not make a store request when no MCP endpoint is configured", async () => {
    await expect(getChariowGeography({ mcp_url: null, access_token_encrypted: null }, period)).rejects.toThrow("Connexion Chariow indisponible");
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.callTool).not.toHaveBeenCalled();
  });
});
