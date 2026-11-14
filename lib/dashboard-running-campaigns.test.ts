import { describe, expect, it } from "vitest";
import { countRunningCampaigns, type DashboardCampaign, type DashboardVariantPack } from "./dashboard-running-campaigns";

describe("countRunningCampaigns", () => {
  it("counts only active and in-review standard campaigns", () => {
    const campaigns: DashboardCampaign[] = [
      { id: "active-1", status: "active" },
      { id: "review-1", status: "review" },
      { id: "paused-1", status: "paused" },
      { id: "active-1", status: "active" },
    ];

    expect(countRunningCampaigns(campaigns, [])).toBe(2);
  });

  it("counts a Pack only after its launch and current Meta status are confirmed", () => {
    const packs: DashboardVariantPack[] = [
      { id: "draft", status: "draft", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "claimed", status: "claimed", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "blocked", status: "blocked", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "partial", status: "partial", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "ambiguous", status: "ambiguous", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "not-activated", status: "completed", checkpoints: { activated: false, meta_state: { status: "active" } } },
      { id: "unknown", status: "completed", checkpoints: { activated: true, meta_state: { status: "unknown" } } },
      { id: "completed", status: "completed", checkpoints: { activated: true, meta_state: { status: "active", synced_at: "2026-11-14T08:00:00.000Z" } } },
    ];

    expect(countRunningCampaigns([], packs)).toBe(1);
  });

  it("counts a three-ad Pack once and deduplicates it against the same Meta campaign", () => {
    const campaign: DashboardCampaign = {
      id: "vendeo-row",
      status: "active",
      external_campaign_id: "meta-campaign-1",
    };
    const pack: DashboardVariantPack = {
      id: "pack-1",
      status: "completed",
      external_campaign_id: "meta-campaign-1",
      checkpoints: { activated: true, meta_state: { status: "active", synced_at: "2026-11-14T08:00:00.000Z" } },
      variants: [{}, {}, {}],
    };

    expect(countRunningCampaigns([campaign], [pack, pack])).toBe(1);
  });

  it("counts distinct confirmed active or in-review Packs once each", () => {
    const packs: DashboardVariantPack[] = [
      { id: "pack-1", status: "completed", external_campaign_id: "meta-1", checkpoints: { activated: true, meta_state: { status: "active" } } },
      { id: "pack-2", status: "completed", external_campaign_id: "meta-2", checkpoints: { activated: true, meta_state: { status: "review" } } },
      { id: "pack-2-copy", status: "completed", external_campaign_id: "meta-2", checkpoints: { activated: true, meta_state: { status: "active" } } },
    ];

    expect(countRunningCampaigns([], packs)).toBe(2);
  });

  it("uses the linked Pack Meta status instead of a stale active campaign row", () => {
    const campaign: DashboardCampaign = {
      id: "campaign-1",
      status: "active",
      external_campaign_id: "meta-campaign-1",
    };
    const pack: DashboardVariantPack = {
      id: "pack-1",
      status: "completed",
      external_campaign_id: "meta-campaign-1",
      checkpoints: { activated: true, meta_state: { status: "paused", synced_at: "2026-11-14T08:00:00.000Z" } },
    };

    expect(countRunningCampaigns([campaign], [pack])).toBe(0);
  });

  it("does not count a stale active campaign row when its linked Pack is confirmed deleted at Meta", () => {
    const campaign: DashboardCampaign = { id: "campaign-1", status: "active", external_campaign_id: "meta-campaign-1" };
    const pack: DashboardVariantPack = {
      id: "pack-1",
      status: "completed",
      external_campaign_id: "meta-campaign-1",
      checkpoints: { activated: true, meta_state: { status: "deleted", synced_at: "2026-11-14T08:00:00.000Z" } },
    };

    expect(countRunningCampaigns([campaign], [pack])).toBe(0);
  });

  it.each([undefined, "unknown"] as const)("does not trust a stale active campaign row when linked Pack status is %s", (metaStatus) => {
    const campaign: DashboardCampaign = { id: "campaign-1", status: "active", external_campaign_id: "meta-campaign-1" };
    const pack: DashboardVariantPack = {
      id: "pack-1",
      status: "completed",
      external_campaign_id: "meta-campaign-1",
      checkpoints: { activated: true, ...(metaStatus ? { meta_state: { status: metaStatus } } : {}) },
    };

    expect(countRunningCampaigns([campaign], [pack])).toBe(0);
  });

  it("does not count a Pack that was launched but has no confirmed Meta status yet", () => {
    const pack: DashboardVariantPack = { id: "pack-1", status: "completed", checkpoints: { activated: true } };
    expect(countRunningCampaigns([], [pack])).toBe(0);
  });
});
