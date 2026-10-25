import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMetaCampaignList } from "./campaign-list";

afterEach(() => vi.restoreAllMocks());

describe("fetchMetaCampaignList", () => {
  it("follows every page by default, without the former silent 300-campaign cap", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ data: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` })), paging: { next: "https://graph.facebook.com/page2" } })));
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ data: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}` })), paging: { next: "https://graph.facebook.com/page3" } })));
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ data: Array.from({ length: 101 }, (_, i) => ({ id: `c${i}` })) })));
    const result = await fetchMetaCampaignList("act_1", "token");
    expect(result).toHaveLength(301);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenCalledWith("Meta campaign inventory counters", { campaigns: 301, graphPages: 3 });
    expect(JSON.stringify(info.mock.calls)).not.toContain("token");
  });

  it("throws rather than returning a partial inventory when a later page fails", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ data: [{ id: "a" }], paging: { next: "https://graph.facebook.com/page2" } })));
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "permission denied" } }), { status: 403 }));
    await expect(fetchMetaCampaignList("act_1", "token")).rejects.toThrow("permission denied");
  });

  it.each([{}, { data: null }, { data: [{}] }, { data: [], error: { message: "failure" } }])("rejects malformed inventories instead of treating them as empty: %j", async (body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(fetchMetaCampaignList("act_1", "token")).rejects.toThrow(/inventory/);
  });

  it("rejects pagination loops instead of returning a misleading partial inventory", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: "a" }], paging: { next: "https://graph.facebook.com/repeated" } })));
    await expect(fetchMetaCampaignList("act_1", "token")).rejects.toThrow("did not advance");
  });
});
