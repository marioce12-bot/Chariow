import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  decryptSecret: vi.fn(),
  fetchMetaGraph: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/api", () => ({ META_GRAPH_BASE_URL: "https://graph.facebook.com/v23.0" }));
vi.mock("@/lib/meta/graph", () => ({ fetchMetaGraph: mocks.fetchMetaGraph }));

import { GET } from "./route";

const CAMPAIGN_ID = "120254598064950655";
const AD_SET_ID = "120254598065610655";
const EXPECTED_FIELDS = "id,status,effective_status,objective,targeting,optimization_goal,destination_type,promoted_object";
const previousEnabled = process.env.META_PAUSED_SALES_TEST_ENABLED;
const previousUserId = process.env.META_PAUSED_SALES_TEST_USER_ID;
const previousVercelEnv = process.env.VERCEL_ENV;

const query: any = {};
query.select = vi.fn(() => query);
query.eq = vi.fn(() => query);
query.limit = vi.fn(() => query);
query.maybeSingle = vi.fn();

function graphResponse(data: Record<string, unknown>, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(data) } as unknown as Response;
}

function makeRequest(queryString = "") {
  return new Request(`https://vendeo.test/api/internal/meta-paused-sales-test/objects${queryString}`);
}

function campaignData() {
  return {
    id: CAMPAIGN_ID,
    status: "PAUSED",
    effective_status: "PAUSED",
    objective: "OUTCOME_SALES",
    targeting: { geo_locations: { countries: ["BJ"] } },
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    promoted_object: { custom_event_type: "PURCHASE" },
    unrelated_internal_field: "must-not-escape",
  };
}

function adSetData() {
  return {
    id: AD_SET_ID,
    status: "PAUSED",
    effective_status: "CAMPAIGN_PAUSED",
    objective: "OUTCOME_SALES",
    targeting: { publisher_platforms: ["instagram", "whatsapp"] },
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: "pixel-value" },
    access_token: "must-not-escape",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_ENV = "preview";
  process.env.META_PAUSED_SALES_TEST_ENABLED = "true";
  process.env.META_PAUSED_SALES_TEST_USER_ID = "marioce-user";

  query.maybeSingle.mockResolvedValue({
    data: { access_token_encrypted: "encrypted-meta-token" },
    error: null,
  });
  mocks.supabaseFrom.mockReturnValue(query);
  mocks.requireUser.mockResolvedValue({
    supabase: { from: mocks.supabaseFrom },
    user: { id: "marioce-user" },
    response: null,
  });
  mocks.decryptSecret.mockReturnValue("decrypted-meta-token");
  mocks.fetchMetaGraph.mockImplementation(async (input: URL, init: RequestInit) => {
    const id = new URL(String(input)).pathname.split("/").at(-1);
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    return graphResponse(id === CAMPAIGN_ID ? campaignData() : adSetData());
  });
});

afterEach(() => {
  if (previousEnabled === undefined) delete process.env.META_PAUSED_SALES_TEST_ENABLED;
  else process.env.META_PAUSED_SALES_TEST_ENABLED = previousEnabled;
  if (previousUserId === undefined) delete process.env.META_PAUSED_SALES_TEST_USER_ID;
  else process.env.META_PAUSED_SALES_TEST_USER_ID = previousUserId;
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
});

describe("GET /api/internal/meta-paused-sales-test/objects", () => {
  it("ne lit que les deux IDs serveur, une fois chacun, et ne renvoie que les champs demandés", async () => {
    const response = await GET(makeRequest("?campaign_id=client-campaign&ad_set_id=client-ad-set&id=client-id"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({
      campaign: {
        id: CAMPAIGN_ID,
        status: "PAUSED",
        effective_status: "PAUSED",
        objective: "OUTCOME_SALES",
        targeting: { geo_locations: { countries: ["BJ"] } },
        optimization_goal: "OFFSITE_CONVERSIONS",
        destination_type: "WEBSITE",
        promoted_object: { custom_event_type: "PURCHASE" },
      },
      ad_set: {
        id: AD_SET_ID,
        status: "PAUSED",
        effective_status: "CAMPAIGN_PAUSED",
        objective: "OUTCOME_SALES",
        targeting: { publisher_platforms: ["instagram", "whatsapp"] },
        optimization_goal: "OFFSITE_CONVERSIONS",
        destination_type: "WEBSITE",
        promoted_object: { pixel_id: "pixel-value" },
      },
    });

    expect(mocks.fetchMetaGraph).toHaveBeenCalledTimes(2);
    const requestedUrls = mocks.fetchMetaGraph.mock.calls.map(([input]) => new URL(String(input)));
    expect(requestedUrls.map((url) => url.pathname.split("/").at(-1)).sort()).toEqual([CAMPAIGN_ID, AD_SET_ID].sort());
    expect(requestedUrls.every((url) => url.searchParams.get("fields") === EXPECTED_FIELDS)).toBe(true);
    expect(requestedUrls.every((url) => url.searchParams.get("access_token") === "decrypted-meta-token")).toBe(true);
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseFrom).toHaveBeenCalledWith("meta_ad_accounts");
    expect(query.select).toHaveBeenCalledTimes(1);
    expect(query.select).toHaveBeenCalledWith("access_token_encrypted");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "marioce-user");
    expect(query.eq).toHaveBeenNthCalledWith(2, "is_active", true);
    expect(query.limit).toHaveBeenCalledTimes(1);
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(mocks.decryptSecret).toHaveBeenCalledTimes(1);
    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted-meta-token");
    expect(JSON.stringify(result)).not.toContain("decrypted-meta-token");
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
  });

  it("exige l’authentification avant de lire la ligne Meta ou d’appeler Graph", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, response: new Response(null, { status: 401 }) });
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it("refuse tout utilisateur autre que celui de l’allowlist avant toute lecture", async () => {
    mocks.requireUser.mockResolvedValueOnce({
      supabase: { from: mocks.supabaseFrom },
      user: { id: "other-user" },
      response: null,
    });
    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "true"],
    ["preview", "false"],
  ])("reste fermée avec VERCEL_ENV=%s et flag=%s", async (environment, enabled) => {
    process.env.VERCEL_ENV = environment;
    process.env.META_PAUSED_SALES_TEST_ENABLED = enabled;
    const response = await GET(makeRequest());
    expect(response.status).toBe(404);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it("ne retente pas si un GET Graph échoue", async () => {
    mocks.fetchMetaGraph.mockImplementation(async (input: URL) => {
      const id = new URL(String(input)).pathname.split("/").at(-1);
      return graphResponse(id === CAMPAIGN_ID ? { error: { message: "upstream details" } } : adSetData(), id !== CAMPAIGN_ID);
    });
    const response = await GET(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.fetchMetaGraph).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await response.json())).not.toContain("upstream details");
  });
});
