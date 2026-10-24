import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPinterestAdReport, fetchPinterestCampaignReport } from "./report";

afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchPinterestAdReport", () => {
  it("envoie dates, colonnes et granularity à l'endpoint v5 et parse les lignes à plat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([{
      AD_ID: "ad-1",
      SPEND_IN_MICRO_DOLLAR: 2_500_000,
      IMPRESSION_1: 120,
      CLICKTHROUGH_1: 12,
      TOTAL_CONVERSIONS: 5,
    }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPinterestAdReport("account/1", "token", ["ad-1"], "2026-01-01", "2026-01-31")).resolves.toEqual([
      { id: "ad-1", impressions: 120, clicks: 12, spend: 2.5, conversions: 5, cpa: 0.5 },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.pinterest.com/v5/ad_accounts/account%2F1/ads/analytics?start_date=2026-01-01&end_date=2026-01-31&ad_ids=ad-1&columns=SPEND_IN_MICRO_DOLLAR%2CIMPRESSION_1%2CCLICKTHROUGH_1%2CTOTAL_CONVERSIONS&granularity=TOTAL");
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  it("traite les ids par lots maximum 250 et accepte ad_id/metrics", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ ad_id: "ad-1", metrics: { SPEND_IN_MICRO_DOLLAR: 1_250_000, IMPRESSION_1: 3, CLICKTHROUGH_1: 1, TOTAL_CONVERSIONS: 1 } }]))
      .mockResolvedValueOnce(response([{ ad_id: "ad-251", metrics: { SPEND_IN_MICRO_DOLLAR: 0, IMPRESSION_1: 0, CLICKTHROUGH_1: 0, TOTAL_CONVERSIONS: 0 } }]));
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from({ length: 251 }, (_, index) => `ad-${index + 1}`);

    const result = await fetchPinterestAdReport("account", "token", ids, "2026-01-01", "2026-01-02");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(String(fetchMock.mock.calls[0][0]));
    const second = new URL(String(fetchMock.mock.calls[1][0]));
    expect(first.searchParams.get("ad_ids")!.split(",")).toHaveLength(250);
    expect(second.searchParams.get("ad_ids")).toBe("ad-251");
    expect(result).toEqual([
      { id: "ad-1", impressions: 3, clicks: 1, spend: 1.25, conversions: 1, cpa: 1.25 },
      { id: "ad-251", impressions: 0, clicks: 0, spend: 0, conversions: 0, cpa: null },
    ]);
  });

  it("retourne l'absence de données si Pinterest ne renvoie aucune ligne", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPinterestAdReport("account", "token", ["ad-1"], "2026-01-01", "2026-01-02")).resolves.toEqual([]);
  });

  it("propage une erreur HTTP Pinterest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ message: "Invalid access token" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPinterestAdReport("account", "token", ["ad-1"], "2026-01-01", "2026-01-02")).rejects.toThrow("Invalid access token");
  });

  it("ne lance aucun fetch pour une entrée vide", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPinterestAdReport("account", "token", [], "2026-01-01", "2026-01-02")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchPinterestCampaignReport pagination", () => {
  it("reads every campaign page before requesting analytics", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ id: "c1", name: "Campaign 1" }], bookmark: "page-2" }))
      .mockResolvedValueOnce(response({ items: [{ id: "c2", name: "Campaign 2" }] }))
      .mockResolvedValueOnce(response([
        { CAMPAIGN_ID: "c1", SPEND_IN_MICRO_DOLLAR: 1_000_000, IMPRESSION_1: 10, CLICKTHROUGH_1: 2, TOTAL_CONVERSIONS: 1 },
        { CAMPAIGN_ID: "c2", SPEND_IN_MICRO_DOLLAR: 2_000_000, IMPRESSION_1: 20, CLICKTHROUGH_1: 3, TOTAL_CONVERSIONS: 0 },
      ]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPinterestCampaignReport("account", "token", "2026-01-01", "2026-01-31");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("bookmark")).toBe("page-2");
    expect(result).toEqual([
      { id: "c1", name: "Campaign 1", spend: 1, impressions: 10, clicks: 2, conversions: 1, cpa: 1 },
      { id: "c2", name: "Campaign 2", spend: 2, impressions: 20, clicks: 3, conversions: 0, cpa: null },
    ]);
  });

  it("fails rather than looping forever if Pinterest repeats a bookmark", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response({ items: [], bookmark: "same" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPinterestCampaignReport("account", "token", "2026-01-01", "2026-01-31"))
      .rejects.toThrow("repeated a bookmark");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
