import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  syncMetaInsights: vi.fn(),
  syncMetaCampaignStatuses: vi.fn(),
  decryptSecret: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/meta/sync", () => ({ syncMetaInsights: mocks.syncMetaInsights }));
vi.mock("@/lib/meta/campaign-status-sync", () => ({ syncMetaCampaignStatuses: mocks.syncMetaCampaignStatuses }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.limit = vi.fn().mockResolvedValue({
    data: [{ id: "account-1", user_id: "user-1", meta_integration_id: "integration-1", meta_account_id: "123", access_token_encrypted: "encrypted", last_sync_error: "META_REAUTH_REQUIRED:invalid" }],
    error: null,
  });
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => query) });
});

describe("GET /api/cron/meta/sync", () => {
  it("returns 200 skipped without calling Meta for an account requiring reconnection", async () => {
    const response = await GET(new Request("https://preview.example/api/cron/meta/sync", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [{ id: "account-1", ok: false, skipped: true, reason: "reauth_required" }],
    });
    expect(mocks.syncMetaInsights).not.toHaveBeenCalled();
    expect(mocks.syncMetaCampaignStatuses).not.toHaveBeenCalled();
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
  });
});
