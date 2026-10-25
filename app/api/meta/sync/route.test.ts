import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  syncMetaInsights: vi.fn(),
  syncMetaCampaignStatuses: vi.fn(),
  decryptSecret: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/meta/sync", () => ({ syncMetaInsights: mocks.syncMetaInsights }));
vi.mock("@/lib/meta/campaign-status-sync", () => ({ syncMetaCampaignStatuses: mocks.syncMetaCampaignStatuses }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const result = { data: {
    id: "account-1",
    meta_integration_id: "integration-1",
    meta_account_id: "123",
    access_token_encrypted: "encrypted",
    last_sync_error: "META_REAUTH_REQUIRED:invalid",
  }, error: null };
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: vi.fn(() => query) } });
});

describe("POST /api/meta/sync", () => {
  it("returns needs_reconnect without decrypting the token or starting a Graph sync", async () => {
    const response = await POST(new Request("https://preview.example/api/meta/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: "account-1" }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ needs_reconnect: true });
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.syncMetaInsights).not.toHaveBeenCalled();
    expect(mocks.syncMetaCampaignStatuses).not.toHaveBeenCalled();
  });
});
