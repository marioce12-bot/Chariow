import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CAMPAIGN_ACTION_TAG as tag, campaignManagementContext, resolveCampaignActionProposal } from "@/lib/chat/campaign-action-proposal";
const campaigns = [{ id: "owned-1", title: "Guide IA", platform: "meta", status: "active", external_campaign_id: "meta-1" }];
describe("Assistant campaign action proposals", () => {
  it("leaves normal answers and campaign creation unchanged", () => {
    expect(resolveCampaignActionProposal("Hello", campaigns)).toBe("Hello");
    expect(resolveCampaignActionProposal('[[LANCE_CAMPAGNE]]{"name":"New"}', campaigns)).toBe('[[LANCE_CAMPAGNE]]{"name":"New"}');
  });
  it.each(["edit", "delete", "pause", "activate", "duplicate"])("only proposes a known %s UI card", action => {
    const result = resolveCampaignActionProposal(`${tag}${JSON.stringify({ campaignId: "owned-1", action, confirmed: true, changes: { daily_budget: 10000 } })}`, campaigns);
    expect(JSON.parse(result.split(tag)[1])).toEqual({ campaignId: "owned-1", action });
  });
  it.each(["null", "[]", "{broken", '{"campaignId":"foreign","action":"delete"}', '{"campaignId":"owned-1","action":"launch"}'])("rejects unsafe output %s", raw => {
    const result = resolveCampaignActionProposal(`Done! ${tag}${raw}`, campaigns);
    expect(result).not.toContain(tag);
    expect(result).not.toContain("Done!");
    expect(result).toContain("Aucune action");
  });
  it("handles missing catalogue without inventing success and supports English", () => {
    expect(resolveCampaignActionProposal(`${tag}{"campaignId":"owned-1","action":"pause"}`, [], "en")).toContain("No action has been performed");
  });
  it("replaces model success claims with a deterministic pending notice", () => {
    const result = resolveCampaignActionProposal(`Campagne activée ! ${tag}{"campaignId":"owned-1","action":"activate"}`, campaigns);
    expect(result).not.toContain("Campagne activée");
    expect(result).toContain("Aucune action n’a été effectuée");
    expect(result).toContain(tag);
  });
  it("labels cached statuses and requires fresh verification and confirmation", () => {
    const context = campaignManagementContext(campaigns);
    expect(context).toContain('"localStatus":"active"');
    expect(context).toContain("NON vérifiés");
    expect(context).toContain("clic de confirmation explicite");
    expect(context).toContain("jamais actif");
    expect(context).toContain("ordre explicite");
  });
  it("keeps Gemini 3.6 and does not introduce an Imole fallback or server mutations in chat", () => {
    const route = readFileSync("app/api/chat/route.ts", "utf8");
    expect(route).toContain('model: "gemini-3.6-flash"');
    expect(route).toContain("timeoutMs: 60000, thinkingLevel: \"LOW\"");
    expect(route).not.toMatch(/askImole|from.*imole/);
    expect(route).toContain("resolveCampaignActionProposal");
    expect(route).not.toContain("executeCampaignAction");
  });
});
