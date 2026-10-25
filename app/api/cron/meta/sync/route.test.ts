import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.restoreAllMocks());

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
  it("returns 200 skipped without calling Meta and logs only a hashed account alias and counters", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
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

    const accountAlias = createHash("sha256").update("account-1").digest("hex").slice(0, 16);
    expect(info).toHaveBeenCalledWith("Meta cron account skipped", { accountAlias, skippedAccounts: 1 });
    expect(info).toHaveBeenCalledWith("Meta cron counters", { skippedAccounts: 1 });
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain("account-1");
    expect(logs).not.toContain("user-1");
    expect(logs).not.toContain("integration-1");
    expect(logs).not.toContain("123");
    expect(logs).not.toContain("encrypted");
  });
});
