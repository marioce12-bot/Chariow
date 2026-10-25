import { beforeEach, describe, expect, it, vi } from "vitest";
const { fetchMetaInsights, fetchMetaCampaignList } = vi.hoisted(() => ({ fetchMetaInsights: vi.fn(), fetchMetaCampaignList: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "token" }));
vi.mock("./api", () => ({ fetchMetaInsights, actionValue: () => 0 }));
vi.mock("./campaign-list", () => ({ fetchMetaCampaignList }));
import { syncMetaInsights } from "./sync";

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
    fetchMetaCampaignList.mockResolvedValue([{ id: "campaign-1", name: "Campaign" }]);
  });
  it("records only the exact successfully synced window as complete", async () => {
    const { supabase, updates } = setup();
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(updates[0]).toMatchObject({ insights_sync_from: "2026-10-01", insights_sync_to: "2026-10-17", insights_sync_complete: true, last_sync_error: null });
    expect(fetchMetaInsights).toHaveBeenCalledTimes(4);
  });
  it("invalidates prior coverage when an insights request fails", async () => {
    const { supabase, updates } = setup();
    fetchMetaInsights.mockRejectedValueOnce(new Error("network"));
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(updates[0]).toMatchObject({ insights_sync_from: "2026-10-01", insights_sync_to: "2026-10-17", insights_sync_complete: false, last_sync_error: expect.stringContaining("campaign: network") });
  });
  it("preserves missing campaign spend as null and marks coverage incomplete", async () => {
    const { supabase, updates, upserts } = setup();
    fetchMetaInsights.mockResolvedValueOnce([{ id: "campaign-1", spend: null }]);
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(upserts.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ level: "campaign", spend: null })]));
    expect(updates[0]).toMatchObject({ insights_sync_complete: false, last_sync_error: expect.stringContaining("spend manquant") });
  });
  it("treats a full 200-row local campaign result as incomplete coverage", async () => {
    const { supabase, updates } = setup(Array.from({ length: 200 }, (_, i) => ({ external_campaign_id: `local-${i}`, title: null, product_name: null })));
    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");
    expect(updates[0]).toMatchObject({ insights_sync_complete: false, last_sync_error: expect.stringContaining("limitée à 200") });
  });

  it("counts campaign-ID insight requests without logging their IDs or names", async () => {
    fetchMetaCampaignList.mockResolvedValue([
      { id: "campaign-1", name: "Campaign One" },
      { id: "campaign-2", name: "Campaign Two" },
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { supabase } = setup();

    await syncMetaInsights(supabase, account, "2026-10-01", "2026-10-17");

    expect(fetchMetaInsights).toHaveBeenCalledTimes(5);
    expect(info).toHaveBeenCalledWith("Meta campaign ID counters", { campaignByIdRequests: 2 });
    const counterLog = info.mock.calls.find(([message]) => message === "Meta campaign ID counters");
    expect(counterLog).toEqual(["Meta campaign ID counters", { campaignByIdRequests: 2 }]);
    expect(JSON.stringify(counterLog)).not.toContain("Campaign One");
    expect(JSON.stringify(counterLog)).not.toContain("campaign-1");
  });
});
