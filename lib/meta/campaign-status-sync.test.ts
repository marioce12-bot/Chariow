import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMetaAccountStatus, getMetaAdReviewStatus, fetchMetaCampaignList } = vi.hoisted(() => ({
  fetchMetaAccountStatus: vi.fn(),
  getMetaAdReviewStatus: vi.fn(),
  fetchMetaCampaignList: vi.fn(),
}));
vi.mock("@/lib/meta/campaign-list", () => ({ fetchMetaCampaignList }));
vi.mock("@/lib/meta/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/api")>();
  return { ...actual, fetchMetaAccountStatus };
});
vi.mock("@/lib/meta/campaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/campaigns")>();
  return { ...actual, getMetaAdReviewStatus };
});

import { syncMetaCampaignStatuses } from "./campaign-status-sync";

describe("syncMetaCampaignStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMetaAccountStatus.mockResolvedValue(1);
    fetchMetaCampaignList.mockResolvedValue([{ id: "campaign-parent", name: null, effectiveStatus: "ACTIVE" }]);
    getMetaAdReviewStatus.mockResolvedValue({ effectiveStatus: "ACTIVE", feedback: null, impressions: 1, createdTime: "2026-01-01T00:00:00.000Z", updatedTime: "2026-01-01T00:00:00.000Z" });
  });

  it("uses stable ID-ordered pages and refreshes locally paused campaigns", async () => {
    const calls: string[] = [];
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      order: vi.fn((column: string, options: { ascending: boolean }) => { calls.push(`order:${column}:${options.ascending}`); return query; }),
      not: vi.fn(() => query),
      range: vi.fn(async (start: number, end: number) => { calls.push(`range:${start}:${end}`); return { data: [{ id: "campaign-1", external_ad_id: "ad-1", external_campaign_id: "campaign-parent", status: "paused", external_error: null }], error: null }; }),
      update: vi.fn((values: unknown) => ({ eq: async () => { calls.push(`update:${JSON.stringify(values)}`); return { error: null }; } })),
    };
    const supabase = { from: vi.fn((table: string) => { calls.push(`table:${table}`); return query; }) };
    const result = await syncMetaCampaignStatuses({ supabase, accountId: "account-1", metaAccountId: "123", accessToken: "token" });

    expect(calls).toContain("order:id:true");
    expect(calls).toContain("range:0:499");
    expect(getMetaAdReviewStatus).toHaveBeenCalledWith({ adId: "ad-1", accessToken: "token" });
    expect(calls.some((call) => call.startsWith("update:") && call.includes("\"status\":\"active\"") && call.includes("\"meta_delivery_observation\"") && call.includes("\"baseline_impressions\":1"))).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.updated).toBe(1);
  });
});


describe("Meta inventory reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMetaAccountStatus.mockResolvedValue(1);
  });

  function db(row: any) {
    const updates: any[] = [];
    const query: any = { select: () => query, eq: () => query, in: () => query, order: () => query, not: () => query, range: async () => ({ data: row ? [row] : [], error: null }), update: (values: any) => { updates.push(values); return { eq: async () => ({ error: null }) }; } };
    return { supabase: { from: () => query }, updates };
  }

  it("pauses (does not delete) an active row absent from a complete inventory, even when ad lookup returns #100", async () => {
    const { supabase, updates } = db({ id: "x", external_ad_id: "ad-x", external_campaign_id: "parent-x", status: "active", external_error: null });
    fetchMetaCampaignList.mockResolvedValue([]);
    getMetaAdReviewStatus.mockRejectedValue(new Error("(#100) Unsupported get request"));
    const result = await syncMetaCampaignStatuses({ supabase, accountId: "a", metaAccountId: "1", accessToken: "t" });
    expect(updates).toContainEqual(expect.objectContaining({ status: "paused", external_error: expect.stringContaining("META_UNAVAILABLE:") }));
    expect(result.errors).toBe(0);
  });

  it("does not reconcile when inventory pagination fails", async () => {
    const { supabase, updates } = db({ id: "x", external_ad_id: "ad-x", external_campaign_id: "parent-x", status: "active", external_error: null });
    fetchMetaCampaignList.mockRejectedValue(new Error("network"));
    const result = await syncMetaCampaignStatuses({ supabase, accountId: "a", metaAccountId: "1", accessToken: "t" });
    expect(updates).not.toContainEqual(expect.objectContaining({ status: "paused" }));
    expect(result.errors).toBe(1);
  });
});


describe("terminal parent precedence", () => {
  it("keeps an archived parent terminal despite an active ad lookup", async () => {
    const updates: any[] = [];
    const row = { id: "x", external_ad_id: "ad-x", external_campaign_id: "parent-x", status: "active", external_error: null };
    const query: any = { select: () => query, eq: () => query, in: () => query, order: () => query, not: () => query, range: async () => ({ data: [row], error: null }), update: (values: any) => { updates.push(values); return { eq: async () => ({ error: null }) }; } };
    const supabase = { from: () => query };
    fetchMetaCampaignList.mockResolvedValue([{ id: "parent-x", name: null, effectiveStatus: "ARCHIVED" }]);
    getMetaAdReviewStatus.mockResolvedValue({ effectiveStatus: "ACTIVE", feedback: null, impressions: 1, createdTime: "2026-01-01T00:00:00.000Z", updatedTime: "2026-01-01T00:00:00.000Z" });
    await syncMetaCampaignStatuses({ supabase, accountId: "a", metaAccountId: "1", accessToken: "t" });
    expect(updates).toContainEqual(expect.objectContaining({ status: "archived", external_error: expect.stringContaining("META_ARCHIVED:") }));
    expect(updates).not.toContainEqual(expect.objectContaining({ status: "active" }));
  });
});
