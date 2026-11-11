import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  decryptSecret: vi.fn(() => "test-token"),
  deleteMetaCampaign: vi.fn(),
  getMetaCampaignAccountId: vi.fn(),
  isMetaObjectMissingError: vi.fn((message: string) => /does not exist|has been deleted/i.test(message) && !/cannot be loaded|missing permissions|permission denied|access denied|does not support|unsupported get request/i.test(message)),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/campaigns", () => ({
  deleteMetaCampaign: mocks.deleteMetaCampaign,
  getMetaCampaignAccountId: mocks.getMetaCampaignAccountId,
  isMetaObjectMissingError: mocks.isMetaObjectMissingError,
}));
import { DELETE } from "./route";

const clone = <T,>(value: T): T => value == null ? value : structuredClone(value);
let campaign: any;
let account: any;
let operations: Array<{ table: string; op: string; values?: unknown; filters: Array<[string, unknown]> }>;

function database() {
  return {
    from(table: string) {
      let op = "read";
      let values: any;
      const filters: Array<[string, unknown]> = [];
      const run = async () => {
        operations.push({ table, op, values: clone(values), filters: clone(filters) });
        const rows = table === "ad_campaigns" ? [campaign] : table === "meta_ad_accounts" ? [account] : [];
        const found = rows.find((row) => row && filters.every(([key, value]) => row[key] === value));
        if (op === "read") return { data: clone(found ?? null), error: null };
        if (op === "update") {
          if (found) Object.assign(found, clone(values));
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const query: any = {
        select: () => query,
        update: (next: unknown) => { op = "update"; values = next; return query; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: run,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => run().then(resolve, reject),
      };
      return query;
    },
  };
}

function request() {
  return new Request("http://localhost/api/ad-campaigns?id=campaign-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.resetAllMocks();
  campaign = { id: "campaign-1", user_id: "user-1", platform: "meta", status: "active", meta_ad_account_id: "account-1", external_campaign_id: "meta-campaign-1", external_adset_id: "meta-adset-1", external_ad_id: "meta-ad-1", title: "Campagne test", product_id: "product-1" };
  account = { id: "account-1", user_id: "user-1", is_active: true, meta_account_id: "act_123", access_token_encrypted: "encrypted-token" };
  operations = [];
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: database(), response: null });
  mocks.decryptSecret.mockReturnValue("test-token");
  mocks.getMetaCampaignAccountId.mockResolvedValue("123");
  mocks.deleteMetaCampaign.mockResolvedValue(undefined);
  mocks.isMetaObjectMissingError.mockImplementation((message: string) => /does not exist|has been deleted/i.test(message) && !/cannot be loaded|missing permissions|permission denied|access denied|does not support|unsupported get request/i.test(message));
});

describe("DELETE /api/ad-campaigns — Meta sync (mock provider only)", () => {
  it("requires auth and scopes the campaign lookup to its owner", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, supabase: null, response: Response.json({}, { status: 401 }) });
    expect((await DELETE(request())).status).toBe(401);
    expect(operations).toHaveLength(0);

    campaign.user_id = "another-user";
    expect((await DELETE(request())).status).toBe(404);
    expect(operations[0].filters).toContainEqual(["user_id", "user-1"]);
    expect(mocks.deleteMetaCampaign).not.toHaveBeenCalled();
  });

  it("verifies the linked Meta account and deletes remotely before marking the local history", async () => {
    let statusAtDeleteCall: string | undefined;
    mocks.deleteMetaCampaign.mockImplementation(async () => { statusAtDeleteCall = campaign.status; });
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(statusAtDeleteCall).toBe("active");
    expect(mocks.getMetaCampaignAccountId).toHaveBeenCalledWith({ campaignId: "meta-campaign-1", accessToken: "test-token" });
    expect(mocks.deleteMetaCampaign).toHaveBeenCalledWith({ campaignId: "meta-campaign-1", accessToken: "test-token" });
    expect(campaign.status).toBe("deleted");
    expect(operations.find((operation) => operation.table === "meta_ad_accounts")?.filters).toContainEqual(["user_id", "user-1"]);
  });

  it("does not delete a campaign bound to a different Meta account", async () => {
    mocks.getMetaCampaignAccountId.mockResolvedValue("foreign-account");
    const response = await DELETE(request());
    expect(response.status).toBe(409);
    expect(mocks.deleteMetaCampaign).not.toHaveBeenCalled();
    expect(campaign.status).toBe("active");
  });

  it("keeps the local campaign unchanged if Meta refuses the delete", async () => {
    mocks.deleteMetaCampaign.mockRejectedValue(new Error("Permission denied"));
    const response = await DELETE(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("la campagne a été conservée");
    expect(campaign.status).toBe("active");
    expect(operations.some((operation) => operation.table === "ad_campaigns" && operation.op === "update")).toBe(false);
  });

  it("treats only a positively missing Meta object as already deleted", async () => {
    mocks.getMetaCampaignAccountId.mockRejectedValue(new Error("The campaign does not exist"));
    const missingResponse = await DELETE(request());
    expect(missingResponse.status).toBe(200);
    expect(mocks.deleteMetaCampaign).not.toHaveBeenCalled();
    expect(campaign.status).toBe("deleted");

    campaign.status = "active";
    mocks.getMetaCampaignAccountId.mockRejectedValue(new Error("Unsupported get request: does not exist, cannot be loaded due to missing permissions"));
    const ambiguousResponse = await DELETE(request());
    expect(ambiguousResponse.status).toBe(502);
    expect(campaign.status).toBe("active");
  });

  it("deletes a local-only Meta draft without calling Meta", async () => {
    campaign.status = "draft";
    campaign.external_campaign_id = null;
    campaign.external_adset_id = null;
    campaign.external_ad_id = null;
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(campaign.status).toBe("deleted");
    expect(mocks.getMetaCampaignAccountId).not.toHaveBeenCalled();
    expect(mocks.deleteMetaCampaign).not.toHaveBeenCalled();
  });
});
