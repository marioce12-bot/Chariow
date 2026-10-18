import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUser, provider } = vi.hoisted(() => ({ requireUser: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/meta/campaigns", () => ({ getMetaAdReviewStatus: provider, mapMetaEffectiveStatus: provider }));
import { GET } from "./route";
describe("individual status preserves terminal lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ["paused", "META_PAUSED:Meta indique que la publicité ou son ensemble/campagne est archived. L’historique est conservé.", "archived"],
    ["deleted", "META_DELETED:Historique conservé.", "deleted"],
  ])("keeps %s terminal evidence without a provider call", async (status, external_error, expected) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "campaign-1", platform: "meta", status, external_error, external_ad_id: "ad-1" }, error: null }) };
    const from = vi.fn(() => query);
    requireUser.mockResolvedValue({ supabase: { from }, user: { id: "user-1" }, response: null });
    const response = await GET(new Request("http://localhost/api/ad-campaigns/campaign-1/status"), { params: Promise.resolve({ id: "campaign-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: expected, external_error });
    expect(provider).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });
});
