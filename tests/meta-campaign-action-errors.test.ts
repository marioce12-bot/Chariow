import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteMetaCampaign, getMetaAdReviewStatus, setMetaObjectStatus } from "@/lib/meta/campaigns";
afterEach(() => vi.unstubAllGlobals());
describe("Meta mutation acknowledgements — mocked HTTP only", () => {
  it.each([{}, { success: false }, { error: { message: "denied" } }, { success: true, error: { message: "denied" } }])("rejects unconfirmed deletion %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(deleteMetaCampaign({ campaignId: "test-campaign", accessToken: "test" })).rejects.toThrow();
  });
  it("requires an explicit success acknowledgement on delete", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ success: true })); vi.stubGlobal("fetch", f);
    await expect(deleteMetaCampaign({ campaignId: "test-campaign", accessToken: "test" })).resolves.toBeUndefined();
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });
  it("rejects an error object even when a POST also claims success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, error: { message: "rejected" } })));
    await expect(setMetaObjectStatus({ id: "test", accessToken: "test", status: "ACTIVE" })).rejects.toThrow("rejected");
  });
  it("rejects HTTP-200 read errors instead of trusting their status fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ effective_status: "ACTIVE", error: { message: "denied" } })));
    await expect(getMetaAdReviewStatus({ adId: "test", accessToken: "test" })).rejects.toThrow("denied");
  });
});
