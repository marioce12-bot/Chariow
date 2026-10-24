import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  fetchMetaAccounts: vi.fn(),
  fetchMetaGraph: vi.fn(),
  syncMetaPixels: vi.fn(),
  recoverUnlistedMetaAccountReconnects: vi.fn(),
  accountUpsert: vi.fn(),
  integrationUpsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret, encryptSecret: mocks.encryptSecret }));
vi.mock("@/lib/meta/api", () => ({ fetchMetaAccounts: mocks.fetchMetaAccounts }));
vi.mock("@/lib/meta/graph", () => ({ fetchMetaGraph: mocks.fetchMetaGraph }));
vi.mock("@/lib/meta/pixels", () => ({ syncMetaPixels: mocks.syncMetaPixels }));
vi.mock("@/lib/meta/reauth-recovery", () => ({ recoverUnlistedMetaAccountReconnects: mocks.recoverUnlistedMetaAccountReconnects }));

import { GET } from "./route";

const oauthState = "state-for-test";
const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function makeQuery(table: string) {
  let operation = "select";
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.delete = vi.fn(() => { operation = "delete"; return query; });
  query.upsert = vi.fn((values: unknown) => {
    if (table === "meta_ad_accounts") mocks.accountUpsert(values);
    if (table === "meta_integrations") mocks.integrationUpsert(values);
    return query;
  });
  query.single = vi.fn().mockImplementation(async () => table === "meta_integrations"
    ? { data: { id: "integration-1" }, error: null }
    : { data: { id: "account-row-1" }, error: null });
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    const result = table === "meta_oauth_states"
      ? operation === "delete"
        ? { error: null }
        : { data: [{ id: "state-row-1", state_hash: "encrypted-state", expires_at: expiresAt }], error: null }
      : { data: [], error: null };
    return Promise.resolve(result).then(resolve, reject);
  };
  return query;
}

function makeRequest() {
  return new Request(`https://preview.example/api/integrations/meta/callback?state=${oauthState}&code=authorization-code`);
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_APP_ID", "test-app");
  vi.stubEnv("META_APP_SECRET", "test-secret");
  vi.stubEnv("META_OAUTH_REDIRECT_URI", "https://preview.example/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_VERSION", "v23.0");
  mocks.decryptSecret.mockReturnValue(oauthState);
  mocks.fetchMetaGraph
    .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token", expires_in: 3600 }))
    .mockResolvedValueOnce(jsonResponse({ id: "meta-user-1" }));
  mocks.fetchMetaAccounts.mockResolvedValue([{ id: "act_111", name: "Shop account", currency: "USD" }]);
  mocks.syncMetaPixels.mockResolvedValue({ error: null });
  mocks.recoverUnlistedMetaAccountReconnects.mockResolvedValue({ verified: 0, failed: 0 });
  mocks.requireUser.mockResolvedValue({
    user: { id: "user-1" },
    supabase: { from: vi.fn((table: string) => makeQuery(table)) },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Meta OAuth callback reconnect state", () => {
  it("clears returned accounts during upsert and checks old marked accounts not returned by OAuth", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("meta")).toBe("connected");
    expect(mocks.integrationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      last_error: null,
      access_token_encrypted: "encrypted:fresh-token",
    }));
    expect(mocks.accountUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      meta_account_id: "111",
      access_token_encrypted: "encrypted:fresh-token",
      last_sync_error: null,
    }));
    expect(mocks.recoverUnlistedMetaAccountReconnects).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      integrationId: "integration-1",
      returnedAccountIds: ["act_111"],
      accessToken: "fresh-token",
    }));
  });

  it("reports connected when a previously stored account is verified although OAuth returns no account list", async () => {
    mocks.fetchMetaAccounts.mockResolvedValueOnce([]);
    mocks.recoverUnlistedMetaAccountReconnects.mockResolvedValueOnce({ verified: 1, failed: 0 });

    const response = await GET(makeRequest());

    expect(new URL(response.headers.get("location")!).searchParams.get("meta")).toBe("connected");
    expect(mocks.recoverUnlistedMetaAccountReconnects).toHaveBeenCalledWith(expect.objectContaining({
      returnedAccountIds: [],
      accessToken: "fresh-token",
    }));
  });
});
