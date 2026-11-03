import { afterEach, describe, expect, it, vi } from "vitest";
import { actionValue, fetchMetaInsights, MetaCampaignIdentityUnsupportedError } from "./api";

describe("actionValue", () => {
  it("retient uniquement le premier type d'achat prioritaire présent", () => {
    const actions = [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "8" },
      { action_type: "purchase", value: "10" },
      { action_type: "omni_purchase", value: "12" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(10);
  });

  it("utilise le type de repli non nul sans additionner les valeurs", () => {
    const actions = [
      { action_type: "purchase", value: "0" },
      { action_type: "omni_purchase", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(3);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("fetchMetaInsights", () => {
  it("requests campaign identity for the account-wide campaign query", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ campaign_id: "campaign-1", campaign_name: "Campagne test" }],
    })));

    await fetchMetaInsights("act_1", "test-access-token", "2026-10-01", "2026-10-02", "campaign");

    const requestUrl = new URL(String(fetch.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("fields")).toContain("campaign_id");
    expect(requestUrl.searchParams.get("fields")).toContain("campaign_name");
  });

  it("signals the sync fallback when Meta rejects campaign identity fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 100, message: "Tried accessing nonexisting field (campaign_id)" },
    }), { status: 400 }));

    await expect(fetchMetaInsights("act_1", "test-access-token", "2026-10-01", "2026-10-02", "campaign"))
      .rejects.toBeInstanceOf(MetaCampaignIdentityUnsupportedError);
  });

  it("follows Graph pagination without emitting per-page logs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "insight-1" }],
        paging: { next: "https://graph.facebook.com/v23.0/page2" },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "insight-2" }] })));

    const rows = await fetchMetaInsights("act_1", "test-access-token", "2026-10-01", "2026-10-02", "campaign");

    expect(rows).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(info).not.toHaveBeenCalled();
  });

  it("retries a Meta rate-limit response with bounded exponential backoff", async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 4, message: "Application request limit reached" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "insight-1" }] }), { status: 200 }));

    const pending = fetchMetaInsights("act_1", "test-access-token", "2026-10-01", "2026-10-02", "campaign");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
