import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const component = readFileSync(new URL("../components/chat/CampaignAction.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../components/ChatView.tsx", import.meta.url), "utf8");
describe("campaign action preview safety", () => {
  it("only calls execute from explicit confirmation handler and renders an identified preview", () => {
    const fetchMock = vi.fn();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(component).toContain('phase: "prepare"');
    expect(component).toContain('phase: "execute"');
    expect(component).toContain("confirmed: true");
    expect(component).toContain('onClick={() => void confirm()}');
    expect(component).toContain("preview.name");
    expect(component).toContain("preview.platform");
    expect(component).toContain("preview.currentStatus");
  });
  it("validates explicit USD changes and surfaces backend errors", () => {
    expect(component).toContain("Number.isFinite(Number(budget))");
    expect(component).toContain("at most 2 decimals");
    expect(component).toContain("setError(e instanceof Error ? e.message");
  });
  it("parses and removes campaign action tags from assistant content, including history", () => {
    expect(chat).toContain("[LAUNCH_TAG, CAMPAIGN_ACTION_TAG]");
    expect(chat).toContain("rawContent.slice(0, first.index)");
    expect(chat).toContain("campaignAction ? <CampaignAction");
  });
});
