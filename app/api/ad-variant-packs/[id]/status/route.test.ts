import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  decryptSecret: vi.fn(() => "test-token"),
  createOperations: vi.fn(),
  read: vi.fn(),
  setStatus: vi.fn(),
  deleteCampaign: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/ad-variant-pack-meta-lifecycle", () => ({ createPackMetaLifecycleOperations: mocks.createOperations }));

let pack: any;
let account: any;
let remoteSnapshot: any;
let updates: Array<{ table: string; values: any }>;
let revision: number;

function database() {
  return {
    from: (table: string) => {
      let operation = "read";
      let values: any;
      const filters: [string, unknown][] = [];
      const run = async () => {
        if (operation === "update" && table === "ad_campaigns") {
          updates.push({ table, values: structuredClone(values) });
          return { data: [], error: null };
        }
        const found = (table === "ad_variant_packs" ? [pack] : table === "meta_ad_accounts" ? [account] : [])
          .find((row) => row && filters.every(([key, value]) => row[key] === value));
        if (!found) return { data: null, error: null };
        if (operation === "update") {
          updates.push({ table, values: structuredClone(values) });
          Object.assign(found, structuredClone(values), { updated_at: `db-trigger-${++revision}` });
          return { data: { id: found.id }, error: null };
        }
        return { data: structuredClone(found), error: null };
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

beforeEach(() => {
  vi.resetAllMocks();
  revision = 0;
  updates = [];
  pack = {
    id: "pack-1", user_id: "user-1", status: "completed", meta_ad_account_id: "account-row-id", external_campaign_id: "meta-campaign",
    updated_at: "2026-01-01T00:00:00.000Z", checkpoints: { activated: true, campaignId: "meta-campaign", adsets: ["meta-adset"], ads: ["ad-1", "ad-2", "ad-3"] },
  };
  account = { id: "account-row-id", user_id: "user-1", meta_account_id: "act_123", access_token_encrypted: "encrypted-token", is_active: true, account_status: 1 };
  remoteSnapshot = {
    campaign: { id: "meta-campaign", status: "DELETED", effective_status: "DELETED" },
    adsets: [],
    ads: ["ad-1", "ad-2", "ad-3"].map((id) => ({ id, status: "DELETED", effective_status: "DELETED" })),
    missing: true,
  };
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: database(), response: null });
  mocks.createAdminClient.mockReturnValue(database());
  mocks.decryptSecret.mockReturnValue("test-token");
  mocks.read.mockImplementation(async () => structuredClone(remoteSnapshot));
  mocks.setStatus.mockResolvedValue(undefined);
  mocks.deleteCampaign.mockResolvedValue(undefined);
  mocks.createOperations.mockReturnValue({ read: mocks.read, setStatus: mocks.setStatus, deleteCampaign: mocks.deleteCampaign, campaignId: "meta-campaign", adsetIds: ["meta-adset"], adIds: ["ad-1", "ad-2", "ad-3"] });
});

describe("Pack Meta status sync — mocked Meta only", () => {
  it("marks an externally deleted campaign as deleted in Vendeo and mirrors the linked standard row", async () => {
    const response = await GET(new Request("http://localhost/api/ad-variant-packs/pack-1/status"), { params: Promise.resolve({ id: "pack-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json() as any).meta_state).toMatchObject({ status: "deleted", source: "meta" });
    expect(pack.checkpoints.meta_state).toMatchObject({ status: "deleted", source: "meta" });
    expect(updates.some((entry) => entry.table === "ad_campaigns" && entry.values.status === "deleted")).toBe(true);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.deleteCampaign).not.toHaveBeenCalled();
  });

  it("does not read or change another user’s Pack", async () => {
    pack.user_id = "another-user";
    const response = await GET(new Request("http://localhost/api/ad-variant-packs/pack-1/status"), { params: Promise.resolve({ id: "pack-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
