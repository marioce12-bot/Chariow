import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  decryptSecret: vi.fn(() => "test-token"),
  createOperations: vi.fn(),
  operations: { read: vi.fn(), setStatus: vi.fn(), deleteCampaign: vi.fn(), campaignId: "meta-campaign", adsetIds: ["meta-adset"], adIds: ["ad-1", "ad-2", "ad-3"] },
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/ad-variant-pack-meta-lifecycle", () => ({ createPackMetaLifecycleOperations: mocks.createOperations }));

const copy = <T,>(value: T): T => value == null ? value : structuredClone(value);
const packTemplate = {
  id: "pack-1", user_id: "user-1", status: "completed", meta_ad_account_id: "account-row-id", external_campaign_id: "meta-campaign",
  updated_at: "2026-01-01T00:00:00.000Z", product_name: "Pack de test", variants: [
    { id: "v1", angle: "Angle image" }, { id: "v2", angle: "Angle vidéo" }, { id: "v3", angle: "Angle carrousel" },
  ], checkpoints: { activated: true, campaignId: "meta-campaign", adsets: ["meta-adset"], ads: ["ad-1", "ad-2", "ad-3"] },
};
const accountTemplate = { id: "account-row-id", user_id: "user-1", meta_account_id: "act_123", access_token_encrypted: "encrypted-token", is_active: true, account_status: 1 };
let pack: any;
let account: any;
let snapshot: any;
let revision: number;
let dbCalls: any[];

function database() {
  return {
    from: (table: string) => {
      let operation = "read";
      let values: any;
      const filters: [string, unknown][] = [];
      const run = async () => {
        dbCalls.push({ table, operation, values: copy(values), filters: copy(filters) });
        if (table === "ad_campaigns") return { data: [], error: null };
        const rows = table === "ad_variant_packs" ? [pack] : table === "meta_ad_accounts" ? [account] : [];
        const found = rows.find((row) => row && filters.every(([key, value]) => row[key] === value));
        if (!found) return { data: null, error: null };
        if (operation === "update") {
          Object.assign(found, copy(values), { updated_at: `db-trigger-${++revision}` });
          return { data: { id: found.id, updated_at: found.updated_at }, error: null };
        }
        return { data: copy(found), error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        update: (next: unknown) => { operation = "update"; values = next; return query; },
        maybeSingle: run,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
      };
      return query;
    },
  };
}

const request = (body: object) => new Request("http://localhost/api/ad-variant-packs/pack-1/actions", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
async function call(body: object) { return POST(request(body), { params: Promise.resolve({ id: "pack-1" }) }); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "test-only-confirmation-key");
  pack = copy(packTemplate);
  account = copy(accountTemplate);
  revision = 0;
  dbCalls = [];
  snapshot = {
    campaign: { id: "meta-campaign", account_id: "123", status: "ACTIVE", effective_status: "ACTIVE" },
    adsets: [{ id: "meta-adset", account_id: "123", campaign_id: "meta-campaign", status: "ACTIVE", effective_status: "ACTIVE" }],
    ads: ["ad-1", "ad-2", "ad-3"].map((id) => ({ id, account_id: "123", campaign_id: "meta-campaign", adset_id: "meta-adset", status: "ACTIVE", effective_status: "ACTIVE" })),
  };
  mocks.decryptSecret.mockReturnValue("test-token");
  mocks.createAdminClient.mockReturnValue(database());
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: database(), response: null });
  mocks.operations.read.mockImplementation(async () => copy(snapshot));
  mocks.operations.setStatus.mockImplementation(async (id: string, status: string) => {
    for (const node of [snapshot.campaign, ...snapshot.adsets, ...snapshot.ads]) if (node.id === id) node.status = node.effective_status = status;
  });
  mocks.operations.deleteCampaign.mockResolvedValue(undefined);
  mocks.createOperations.mockReturnValue(mocks.operations);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Pack lifecycle actions — mocked Meta only", () => {
  it("prepares deletion without mutation, then deletes once and rejects a replayed confirmation", async () => {
    const prepared = await call({ phase: "prepare", action: "delete" });
    expect(prepared.status).toBe(200);
    const token = (await prepared.json() as { token: string }).token;
    expect(mocks.operations.deleteCampaign).not.toHaveBeenCalled();
    expect(dbCalls.every((entry) => entry.operation === "read")).toBe(true);

    const executed = await call({ phase: "execute", action: "delete", token, confirmed: true });
    expect(executed.status).toBe(200);
    expect(mocks.operations.deleteCampaign).toHaveBeenCalledTimes(1);
    expect(pack.checkpoints.meta_state).toMatchObject({ status: "deleted", source: "vendeo" });

    const replay = await call({ phase: "execute", action: "delete", token, confirmed: true });
    expect(replay.status).toBe(409);
    expect(mocks.operations.deleteCampaign).toHaveBeenCalledTimes(1);
  });

  it("writes PAUSED only to the selected Pack ad and verifies it without changing its siblings", async () => {
    const prepared = await call({ phase: "prepare", action: "pause-ad", adIndex: 1 });
    expect(prepared.status).toBe(200);
    const preparedData = await prepared.json() as { token: string; preview: { warning: string } };
    expect(preparedData.preview.warning).toContain("uniquement « Angle vidéo » (ad-2)");
    expect(preparedData.preview.warning).toContain("ne seront pas modifiées");
    expect(mocks.operations.setStatus).not.toHaveBeenCalled();

    const executed = await call({ phase: "execute", action: "pause-ad", adIndex: 1, token: preparedData.token, confirmed: true });
    expect(executed.status).toBe(200);
    expect(mocks.operations.setStatus).toHaveBeenCalledTimes(1);
    expect(mocks.operations.setStatus).toHaveBeenCalledWith("ad-2", "PAUSED");
    expect(snapshot.campaign.status).toBe("ACTIVE");
    expect(snapshot.adsets[0].status).toBe("ACTIVE");
    expect(snapshot.ads.map((ad: any) => ad.status)).toEqual(["ACTIVE", "PAUSED", "ACTIVE"]);
    expect(pack.checkpoints.meta_state.ads[1].status).toBe("paused");
  });

  it("requires a confirmed user-owned Pack and account before touching Meta", async () => {
    pack.user_id = "another-user";
    const response = await call({ phase: "prepare", action: "pause" });
    expect(response.status).toBe(404);
    expect(mocks.operations.read).not.toHaveBeenCalled();
    expect(mocks.operations.setStatus).not.toHaveBeenCalled();
  });
});
