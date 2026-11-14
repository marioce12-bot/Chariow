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

  it("includes only successfully completed and activated Packs", () => {
    const packs: DashboardVariantPack[] = [
      { id: "draft", status: "draft", checkpoints: { activated: true } },
      { id: "claimed", status: "claimed", checkpoints: { activated: true } },
      { id: "blocked", status: "blocked", checkpoints: { activated: true } },
      { id: "partial", status: "partial", checkpoints: { activated: true } },
      { id: "ambiguous", status: "ambiguous", checkpoints: { activated: true } },
      { id: "not-activated", status: "completed", checkpoints: { activated: false } },
      { id: "completed", status: "completed", checkpoints: { activated: true } },
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
      checkpoints: { activated: true },
      variants: [{}, {}, {}],
    };

    expect(countRunningCampaigns([campaign], [pack, pack])).toBe(1);
  });

  it("counts distinct confirmed Packs once each when no standard campaign row exists", () => {
    const packs: DashboardVariantPack[] = [
      { id: "pack-1", status: "completed", external_campaign_id: "meta-1", checkpoints: { activated: true } },
      { id: "pack-2", status: "completed", external_campaign_id: "meta-2", checkpoints: { activated: true } },
      { id: "pack-2-copy", status: "completed", external_campaign_id: "meta-2", checkpoints: { activated: true } },
    ];

    expect(countRunningCampaigns([], packs)).toBe(2);
  });

  it("does not count a Pack again when its matching standard campaign is no longer active", () => {
    const campaign: DashboardCampaign = {
      id: "campaign-1",
      status: "paused",
      external_campaign_id: "meta-campaign-1",
    };
    const pack: DashboardVariantPack = {
      id: "pack-1",
      status: "completed",
      external_campaign_id: "meta-campaign-1",
      checkpoints: { activated: true },
    };

    expect(countRunningCampaigns([campaign], [pack])).toBe(0);
  });
});
