import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  syncMetaInsights: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/meta/sync", () => ({ syncMetaInsights: mocks.syncMetaInsights }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: {
    id: "account-1",
    meta_integration_id: "integration-1",
    meta_account_id: "123",
    access_token_encrypted: "encrypted",
    last_sync_error: "META_REAUTH_REQUIRED:invalid",
    last_backfill_at: null,
    backfill_status: null,
    backfill_next_from: null,
    backfill_started_at: null,
  }, error: null });
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: vi.fn(() => query) } });
});

describe("POST /api/meta/backfill", () => {
  it("returns skipped before claiming state or contacting Meta for an invalid token", async () => {
    const response = await POST(new Request("https://preview.example/api/meta/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: "account-1" }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ status: "skipped", needs_reconnect: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.syncMetaInsights).not.toHaveBeenCalled();
  });
});
