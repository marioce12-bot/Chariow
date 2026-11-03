import { beforeEach, describe, expect, it, vi } from "vitest";
const { fetchMetaInsights, fetchMetaCampaignList, MetaCampaignIdentityUnsupportedError } = vi.hoisted(() => ({
  fetchMetaInsights: vi.fn(),
  fetchMetaCampaignList: vi.fn(),
  MetaCampaignIdentityUnsupportedError: class extends Error {},
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "token" }));
vi.mock("./api", () => ({ fetchMetaInsights, MetaCampaignIdentityUnsupportedError, actionValue: () => 0 }));
vi.mock("./campaign-list", () => ({ fetchMetaCampaignList }));
import { resolveMetaInsightsWindow, syncMetaInsights } from "./sync";

function setup(launched: unknown[] = []) {
  const updates: any[] = [];
  const upserts: any[] = [];
  const query: any = {
    select: vi.fn(() => query), eq: vi.fn(() => query), not: vi.fn(() => query), limit: vi.fn(async () => ({ data: launched, error: null })),
    upsert: vi.fn(async (rows: unknown[]) => { upserts.push(rows); return { error: null }; }),
    update: vi.fn((value: unknown) => { updates.push(value); return { eq: async () => ({ error: null }) }; }),
  };
  return { supabase: { from: vi.fn(() => query) }, updates, upserts };
}
const account = { id: "db-account", meta_account_id: "123", access_token_encrypted: "encrypted" };

describe("syncMetaInsights coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMetaInsights.mockResolvedValue([]);
    fetchMetaCampaignList.mockResolvedValue([]);
  });
  it("records only the exact successfully synced window as complete", async () => {
    const { supabase, updates } = setup();
    const stats = await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(updates[0]).toMatchObject({ insights_sync_from: "2026-10-01", insights_sync_to: "2026-10-17", insights_sync_complete: true, last_sync_error: null });
    expect(fetchMetaInsights).toHaveBeenCalledTimes(3);
    expect(fetchMetaInsights.mock.calls.map((call) => call[4])).toEqual(["campaign", "adset", "ad"]);
    expect(stats).toMatchObject({ insightsCalls: 3, rowsRead: 0, rowsWritten: 0, errors: 0 });
  });
  it("preserves the last successful window when an insights request fails", async () => {
    const { supabase, updates } = setup();
    fetchMetaInsights.mockRejectedValueOnce(new Error("network"));
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(updates[0]).toMatchObject({ insights_sync_complete: false, last_sync_error: expect.stringContaining("campaign: network") });
  });
  it("preserves missing campaign spend as null and marks coverage incomplete", async () => {
    const { supabase, updates, upserts } = setup();
    fetchMetaInsights.mockResolvedValueOnce([{ id: "campaign-1", spend: null }]);
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(upserts.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ level: "campaign", spend: null })]));
    expect(updates[0]).toMatchObject({ insights_sync_complete: false, last_sync_error: expect.stringContaining("spend manquant") });
  });
  it("falls back by campaign ID when account-level campaign rows omit identity", async () => {
    const { supabase, upserts, updates } = setup();
    fetchMetaInsights.mockImplementation(async (node: string, _token: string, _from: string, _to: string, level: string) => {
      if (node === "act_123" && level === "campaign") return [{ date_start: "2026-10-01", date_stop: "2026-10-01", spend: "4" }];
      if (node === "campaign-1" && level === "campaign") return [{ date_start: "2026-10-01", date_stop: "2026-10-01", spend: "4" }];
      return [];
    });
    fetchMetaCampaignList.mockResolvedValue([{ id: "campaign-1", name: "Campagne test" }]);

    const stats = await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");

    expect(fetchMetaInsights).toHaveBeenCalledTimes(4);
    expect(fetchMetaInsights).toHaveBeenLastCalledWith("campaign-1", "token", "2026-10-01", "2026-10-17", "campaign", { includeCampaignIdentity: false });
    expect(upserts.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ level: "campaign", entity_id: "campaign-1", entity_name: "Campagne test" })]));
    expect(stats).toMatchObject({ insightsCalls: 4, rowsRead: 2, rowsWritten: 1, errors: 0, campaignFallbackRequests: 1 });
    expect(updates[0]).toMatchObject({ insights_sync_complete: true, insights_sync_to: "2026-10-17" });
  });
  it("falls back by campaign ID when a Meta token rejects identity fields", async () => {
    const { supabase, upserts } = setup();
    fetchMetaInsights.mockImplementation(async (node: string, _token: string, _from: string, _to: string, level: string) => {
      if (node === "act_123" && level === "campaign") throw new MetaCampaignIdentityUnsupportedError("field not supported");
      if (node === "campaign-1" && level === "campaign") return [{ date_start: "2026-10-01", date_stop: "2026-10-01", spend: "4" }];
      return [];
    });
    fetchMetaCampaignList.mockResolvedValue([{ id: "campaign-1", name: "Campagne test" }]);

    const stats = await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");

    expect(stats).toMatchObject({ insightsCalls: 4, rowsWritten: 1, errors: 0, campaignFallbackRequests: 1 });
    expect(upserts.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ level: "campaign", entity_id: "campaign-1" })]));
  });
  it("chooses a three-day rolling window for a completed account and 30 days for first import or resync", () => {
    const now = new Date("2026-11-02T17:00:00.000Z");
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now)).toEqual({ from: "2026-10-31", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({}, now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now)).toEqual({ from: "2026-10-31", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now, { resync: true })).toEqual({ from: "2026-10-04", to: "2026-11-02" });
  });
});
