import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  fetchMetaAccountStatus: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({ encryptSecret: mocks.encryptSecret }));
vi.mock("./api", () => ({ fetchMetaAccountStatus: mocks.fetchMetaAccountStatus }));

import { recoverUnlistedMetaAccountReconnects } from "./reauth-recovery";

function makeQuery(result: unknown, updates: unknown[], filters: unknown[][]) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.like = vi.fn((...args: unknown[]) => { filters.push(args); return query; });
  query.eq = vi.fn((...args: unknown[]) => { filters.push(args); return query; });
  query.update = vi.fn((values: unknown) => { updates.push(values); return query; });
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function makeSupabase(rows: unknown[], updateError: unknown = null, updateData: unknown = { id: "old-row" }) {
  const updates: unknown[] = [];
  const readFilters: unknown[][] = [];
  const writeFilters: unknown[][] = [];
  const readQuery = makeQuery({ data: rows, error: null }, updates, readFilters);
  const updateQuery = makeQuery({ data: updateData, error: updateError }, updates, writeFilters);
  let fromCount = 0;
  const from = vi.fn(() => ++fromCount === 1 ? readQuery : updateQuery);
  return { supabase: { from }, updates, readFilters, writeFilters };
}

const marker = "META_REAUTH_REQUIRED:token expired";
const expiresAt = "2026-12-01T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("recoverUnlistedMetaAccountReconnects", () => {
  it("refreshes the token and clears only an omitted account after its own Graph status succeeds", async () => {
    const { supabase, updates, readFilters, writeFilters } = makeSupabase([
      { id: "old-row", meta_account_id: "222", last_sync_error: marker },
      { id: "returned-row", meta_account_id: "111", last_sync_error: marker },
      { id: "other-error-row", meta_account_id: "333", last_sync_error: "temporary network error" },
    ]);
    mocks.fetchMetaAccountStatus.mockResolvedValue(1);

    const result = await recoverUnlistedMetaAccountReconnects({
      supabase,
      userId: "user-1",
      integrationId: "integration-1",
      returnedAccountIds: ["act_111"],
      accessToken: "fresh-token",
      tokenExpiresAt: expiresAt,
    });

    expect(result).toEqual({ verified: 1, failed: 0 });
    expect(readFilters).toContainEqual(["user_id", "user-1"]);
    expect(readFilters).toContainEqual(["meta_integration_id", "integration-1"]);
    expect(mocks.fetchMetaAccountStatus).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMetaAccountStatus).toHaveBeenCalledWith("222", "fresh-token");
    expect(updates).toEqual([{
      access_token_encrypted: "encrypted:fresh-token",
      token_expires_at: expiresAt,
      last_sync_error: null,
    }]);
    expect(writeFilters).toContainEqual(["id", "old-row"]);
    expect(writeFilters).toContainEqual(["last_sync_error", marker]);
  });

  it("leaves the marker and stored credential untouched when the account-specific Graph call fails", async () => {
    const { supabase, updates } = makeSupabase([
      { id: "old-row", meta_account_id: "222", last_sync_error: marker },
    ]);
    mocks.fetchMetaAccountStatus.mockRejectedValue(new Error("Meta account status request failed (403)"));

    const result = await recoverUnlistedMetaAccountReconnects({
      supabase,
      userId: "user-1",
      integrationId: "integration-1",
      returnedAccountIds: [],
      accessToken: "fresh-token",
      tokenExpiresAt: expiresAt,
    });

    expect(result).toEqual({ verified: 0, failed: 1 });
    expect(mocks.fetchMetaAccountStatus).toHaveBeenCalledWith("222", "fresh-token");
    expect(updates).toEqual([]);
  });

  it("keeps an account marked when Graph succeeds but the guarded database update fails", async () => {
    const { supabase, updates } = makeSupabase([
      { id: "old-row", meta_account_id: "222", last_sync_error: marker },
    ], new Error("database update failed"), null);
    mocks.fetchMetaAccountStatus.mockResolvedValue(1);

    const result = await recoverUnlistedMetaAccountReconnects({
      supabase,
      userId: "user-1",
      integrationId: "integration-1",
      returnedAccountIds: [],
      accessToken: "fresh-token",
      tokenExpiresAt: expiresAt,
    });

    expect(result).toEqual({ verified: 0, failed: 1 });
    expect(updates).toHaveLength(1);
  });

  it("does not count a successful Graph call if no row matched the current marker", async () => {
    const { supabase, updates } = makeSupabase([
      { id: "old-row", meta_account_id: "222", last_sync_error: marker },
    ], null, null);
    mocks.fetchMetaAccountStatus.mockResolvedValue(1);

    const result = await recoverUnlistedMetaAccountReconnects({
      supabase,
      userId: "user-1",
      integrationId: "integration-1",
      returnedAccountIds: [],
      accessToken: "fresh-token",
      tokenExpiresAt: expiresAt,
    });

    expect(result).toEqual({ verified: 0, failed: 1 });
    expect(updates).toHaveLength(1);
  });
});
