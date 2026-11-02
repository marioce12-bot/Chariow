import { beforeEach, describe, expect, it, vi } from "vitest";
const { fetchMetaInsights } = vi.hoisted(() => ({ fetchMetaInsights: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "token" }));
vi.mock("./api", () => ({ fetchMetaInsights, actionValue: () => 0 }));
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
  it("chooses a three-day rolling window for a completed account and 30 days for first import or resync", () => {
    const now = new Date("2026-11-02T17:00:00.000Z");
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now)).toEqual({ from: "2026-10-31", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({}, now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now)).toEqual({ from: "2026-10-31", to: "2026-11-02" });
    expect(resolveMetaInsightsWindow({ insights_sync_to: "2026-11-01" }, now, { resync: true })).toEqual({ from: "2026-10-04", to: "2026-11-02" });
  });
});
