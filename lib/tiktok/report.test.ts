import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTikTokAdReport, fetchTikTokCampaignReport } from "./report";
import { TIKTOK_API_BASE_URL } from "./api";

afterEach(() => vi.unstubAllGlobals());

const response = (data: unknown, code?: number, message = "OK", status = 200) =>
  new Response(JSON.stringify({ ...(code === undefined ? {} : { code }), message, data }), { status });
const row = (adId: string, metrics: Record<string, unknown>) => ({ dimensions: { ad_id: adId }, metrics });

const adFixture = (list: unknown[], page: number, pageSize: number, extraPageInfo: Record<string, unknown> = {}) =>
  response({ list, page_info: { page, page_size: pageSize, ...extraPageInfo } }, 0);

describe("fetchTikTokAdReport", () => {
  it("sends the documented report query and extracts typed/string metrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(adFixture(
      [row("42", { ad_name: "Annonce", spend: "12.5", impressions: 100, clicks: "4", conversion: "2" })],
      1, 200,
    ));
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

  it("paginates using page/page_size when total_page is absent from the v1.3 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(adFixture([row("a", { ad_name: "Name", spend: "3", impressions: "10", clicks: 1, conversion: "1" }), row("b", { ad_name: "Other", spend: "1", impressions: 2, clicks: 1, conversion: "0" })], 1, 2))
      .mockResolvedValueOnce(adFixture([row("a", { ad_name: "Name", spend: 6, impressions: 20, clicks: "2", conversion: 2 })], 2, 2));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchTikTokAdReport("adv", "token", "2026-02-01", "2026-02-02");
    expect(result).toEqual([
      { id: "a", name: "Name", spend: 9, impressions: 30, clicks: 3, conversions: 3, cpa: 3 },
      { id: "b", name: "Other", spend: 1, impressions: 2, clicks: 1, conversions: 0, cpa: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("page")).toBe("2");
  });

  it("accepts provider pagination integers serialized as decimal strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      list: [row("42", { ad_name: "Annonce", spend: "0", impressions: "0", clicks: "0", conversion: "0" })],
      page_info: { page: "1", page_size: "200", total_page: "1" },
    }, 0));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01")).resolves.toEqual([
      { id: "42", name: "Annonce", spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: null },
    ]);
  });

  it("returns an empty array for the exact empty-report envelope, including total_page zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ list: [], page_info: { page: 1, page_size: 200, total_page: 0 } }, 0)));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01")).resolves.toEqual([]);
  });

  it("accepts a successful response with no code when data is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ list: [], page_info: { page: 1, page_size: 200 } })));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01")).resolves.toEqual([]);
  });

  it("surfaces genuine HTTP/API errors instead of treating them as empty reports", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ request_id: "req-1" }, 40002, "Invalid advertiser access token", 400)));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01"))
      .rejects.toThrow("Invalid advertiser access token");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ request_id: "req-2" }, 40002, "Invalid advertiser access token", 200)));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01"))
      .rejects.toThrow("TikTok report API error (40002): Invalid advertiser access token");
  });

  it("does not hide malformed pagination metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(adFixture([], 1, 200, { total_page: "not-a-number" })));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01"))
      .rejects.toThrow('total_page must be a non-negative integer (received {"page":1,"page_size":200,"total_page":"not-a-number"})');
  });

  it("rejects an empty total_page when rows are present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(adFixture([row("42", { spend: "1" })], 1, 200, { total_page: 0 })));
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-01"))
      .rejects.toThrow("inconsistent empty report pagination metadata");
  });

  it("fails explicitly when the ad report exceeds the supported retrieval limit", async () => {
    const fetchMock = vi.fn().mockImplementation((rawUrl: string | URL) => {
      const page = Number(new URL(String(rawUrl)).searchParams.get("page"));
      return Promise.resolve(adFixture([row(`ad-${page}`, { spend: "1" })], page, 1, { total_page: 11 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTikTokAdReport("adv", "token", "2026-01-01", "2026-01-31"))
      .rejects.toThrow("truncated: retrieved 10 of 11 pages");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe("fetchTikTokCampaignReport pagination", () => {
  it("fails explicitly rather than returning a silently truncated campaign report", async () => {
    const fetchMock = vi.fn().mockImplementation((rawUrl: string | URL) => {
      const page = Number(new URL(String(rawUrl)).searchParams.get("page"));
      return Promise.resolve(response({ list: [{ dimensions: { campaign_id: `campaign-${page}` }, metrics: { spend: "1" } }], page_info: { page, page_size: 1, total_page: 11 } }, 0));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTikTokCampaignReport("adv", "token", "2026-01-01", "2026-01-31"))
      .rejects.toThrow("truncated: retrieved 10 of 11 pages");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
