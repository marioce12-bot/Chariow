import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTikTokAdReport, fetchTikTokCampaignReport } from "./report";
import { TIKTOK_API_BASE_URL } from "./api";

afterEach(() => vi.unstubAllGlobals());

const response = (data: unknown, code = 0, message = "OK", status = 200) =>
  new Response(JSON.stringify({ code, message, data }), { status });
const row = (adId: string, metrics: Record<string, unknown>) => ({ dimensions: { ad_id: adId }, metrics });

describe("fetchTikTokAdReport", () => {
  it("sends the documented report query and extracts typed/string metrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ list: [row("42", { ad_name: "Annonce", spend: "12.5", impressions: 100, clicks: "4", conversion: "2" })], page_info: { page: 1, total_page: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchTikTokAdReport("adv-1", "token-1", "2026-01-01", "2026-01-31");
    expect(result).toEqual([{ id: "42", name: "Annonce", impressions: 100, clicks: 4, spend: 12.5, conversions: 2, cpa: 6.25 }]);
    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.origin + url.pathname).toBe(`${TIKTOK_API_BASE_URL}/report/integrated/get/`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      advertiser_id: "adv-1", report_type: "BASIC", data_level: "AUCTION_AD",
      dimensions: '["ad_id"]', metrics: '["ad_name","spend","impressions","clicks","conversion"]',
      start_date: "2026-01-01", end_date: "2026-01-31", page: "1", page_size: "200",
    });
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "Access-Token": "token-1" });
    expect(init.cache).toBe("no-store");
  });

  it("aggregates repeated ad IDs and calculates CPA from the totals", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ list: [row("a", { ad_name: "Name", spend: "3", impressions: "10", clicks: 1, conversion: "1" })], page_info: { page: 1, total_page: 2 } }))
      .mockResolvedValueOnce(response({ list: [row("a", { ad_name: "Name", spend: 6, impressions: 20, clicks: "2", conversion: 2 })], page_info: { page: 2, total_page: 2 } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchTikTokAdReport("adv", "token", "2026-02-01", "2026-02-02");
    expect(result).toEqual([{ id: "a", name: "Name", spend: 9, impressions: 30, clicks: 3, conversions: 3, cpa: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("page")).toBe("2");
  });

  it("returns an empty array for a valid empty report", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ list: [], page_info: { page: 1, total_page: 1 } })));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01")).resolves.toEqual([]);
  });

  it("surfaces API errors without returning partial results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 400, "invalid advertiser", 400)));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01")).rejects.toThrow("invalid advertiser");
  });

  it("fails explicitly when the report exceeds the supported retrieval limit", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response({ list: [], page_info: { page: 1, total_page: 11 } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-31")).rejects.toThrow("truncated: retrieved 10 of 11 pages");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe("fetchTikTokCampaignReport pagination", () => {
  it("fails explicitly rather than returning a silently truncated campaign report", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response({ list: [], page_info: { page: 1, total_page: 11 } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTikTokCampaignReport("adv", "token", "2026-01-01", "2026-01-31"))
      .rejects.toThrow("truncated: retrieved 10 of 11 pages");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
