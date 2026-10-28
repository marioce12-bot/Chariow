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

const ACCOUNT_NAME = "Marioce Atin";
const CAMPAIGN_ID = "120254598064950655";
const AD_SET_ID = "120254598065610655";
const CAMPAIGN_FIELDS = "id,status,effective_status,objective";
const AD_SET_FIELDS = "id,status,effective_status,targeting,optimization_goal,destination_type,promoted_object";
const previousEnabled = process.env.META_PAUSED_SALES_TEST_ENABLED;
const previousUserId = process.env.META_PAUSED_SALES_TEST_USER_ID;
const previousVercelEnv = process.env.VERCEL_ENV;

type AccountRow = {
  id: string;
  name: string;
  meta_account_id: string;
  is_active: boolean;
};

let metadataRows: AccountRow[];
let metadataError: unknown;
let credential: { access_token_encrypted: string } | null;
let credentialError: unknown;
let queryBuilders: any[];

function makeQueryBuilder() {
  const builder: any = {
    selection: "",
    filters: [] as Array<[string, unknown]>,
    select: vi.fn((fields: string) => {
      builder.selection = fields;
      return builder;
    }),
    eq: vi.fn((field: string, value: unknown) => {
      builder.filters.push([field, value]);
      return builder;
    }),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: credential, error: credentialError })),
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve({ data: metadataRows, error: metadataError }).then(resolve, reject),
  };
  queryBuilders.push(builder);
  return builder;
}

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
    unrelated_internal_field: "must-not-escape",
    access_token: "must-not-escape",
  };
}

function adSetData() {
  return {
    id: AD_SET_ID,
    status: "PAUSED",
    effective_status: "CAMPAIGN_PAUSED",
    targeting: { publisher_platforms: ["instagram", "whatsapp"] },
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: "pixel-value" },
    objective: "not-requested-for-ad-set",
    access_token: "must-not-escape",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryBuilders = [];
  metadataRows = [
    { id: "marioce-row", name: ACCOUNT_NAME, meta_account_id: "act-123", is_active: true },
    { id: "other-row", name: "Other Account", meta_account_id: "act-999", is_active: true },
  ];
  metadataError = null;
  credential = { access_token_encrypted: "encrypted-marioce-token" };
  credentialError = null;
  process.env.VERCEL_ENV = "preview";
  process.env.META_PAUSED_SALES_TEST_ENABLED = "true";
  process.env.META_PAUSED_SALES_TEST_USER_ID = "marioce-user";

  mocks.supabaseFrom.mockImplementation(() => makeQueryBuilder());
  mocks.requireUser.mockResolvedValue({
    supabase: { from: mocks.supabaseFrom },
    user: { id: "marioce-user" },
    response: null,
  });
  mocks.decryptSecret.mockReturnValue("decrypted-marioce-token");
  mocks.fetchMetaGraph.mockImplementation(async (input: URL, init: RequestInit) => {
    const url = new URL(String(input));
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(url.searchParams.get("access_token")).toBe("decrypted-marioce-token");
    return graphResponse(url.pathname.endsWith(CAMPAIGN_ID) ? campaignData() : adSetData());
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
  it("ignore les IDs client et lit uniquement le jeton du compte Marioce Atin, puis fait deux GET fixes", async () => {
    const response = await GET(makeRequest(
      "?campaign_id=client-campaign&ad_set_id=client-ad-set&id=client-id&meta_account_id=client-account&account_row_id=other-row",
    ));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({
      campaign: {
        id: CAMPAIGN_ID,
        status: "PAUSED",
        effective_status: "PAUSED",
        objective: "OUTCOME_SALES",
      },
      ad_set: {
        id: AD_SET_ID,
        status: "PAUSED",
        effective_status: "CAMPAIGN_PAUSED",
        targeting: { publisher_platforms: ["instagram", "whatsapp"] },
        optimization_goal: "OFFSITE_CONVERSIONS",
        destination_type: "WEBSITE",
        promoted_object: { pixel_id: "pixel-value" },
      },
    });

    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(2);
    expect(mocks.supabaseFrom).toHaveBeenNthCalledWith(1, "meta_ad_accounts");
    expect(mocks.supabaseFrom).toHaveBeenNthCalledWith(2, "meta_ad_accounts");
    expect(queryBuilders[0].select).toHaveBeenCalledWith("id,name,meta_account_id,is_active");
    expect(queryBuilders[0].filters).toEqual([["user_id", "marioce-user"], ["name", ACCOUNT_NAME]]);
    expect(queryBuilders[0].limit).toHaveBeenCalledWith(2);
    expect(queryBuilders[1].select).toHaveBeenCalledWith("access_token_encrypted");
    expect(queryBuilders[1].filters).toEqual([["id", "marioce-row"], ["user_id", "marioce-user"]]);
    expect(queryBuilders[1].maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.decryptSecret).toHaveBeenCalledTimes(1);
    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted-marioce-token");

    expect(mocks.fetchMetaGraph).toHaveBeenCalledTimes(2);
    const calls = mocks.fetchMetaGraph.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), init }));
    expect(calls.map(({ url }) => url.pathname.split("/").at(-1)).sort()).toEqual([CAMPAIGN_ID, AD_SET_ID].sort());
    expect(calls.find(({ url }) => url.pathname.endsWith(CAMPAIGN_ID))?.url.searchParams.get("fields")).toBe(CAMPAIGN_FIELDS);
    expect(calls.find(({ url }) => url.pathname.endsWith(AD_SET_ID))?.url.searchParams.get("fields")).toBe(AD_SET_FIELDS);
    expect(calls.every(({ init }) => init?.method === "GET")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("decrypted-marioce-token");
    expect(JSON.stringify(result)).not.toContain("encrypted-marioce-token");
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
    expect(JSON.stringify(result)).not.toContain("not-requested-for-ad-set");
  });

  it("exige l’authentification avant de lire les métadonnées ou d’appeler Graph", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, response: new Response(null, { status: 401 }) });
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it("refuse tout utilisateur hors allowlist avant toute lecture", async () => {
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
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it.each([
    ["aucun compte correspondant", []],
    ["deux comptes correspondants", [
      { id: "marioce-row-1", name: ACCOUNT_NAME, meta_account_id: "act-123", is_active: true },
      { id: "marioce-row-2", name: ACCOUNT_NAME, meta_account_id: "act-456", is_active: true },
    ]],
  ])("s’arrête avant le jeton et Graph avec %s", async (_label, rows) => {
    metadataRows = rows as AccountRow[];
    const response = await GET(makeRequest());
    expect(response.status).toBe(503);
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1);
    expect(queryBuilders[0].select).toHaveBeenCalledWith("id,name,meta_account_id,is_active");
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it("ne lit aucun jeton si le compte unique Marioce Atin est inactif", async () => {
    metadataRows = [{ id: "marioce-row", name: ACCOUNT_NAME, meta_account_id: "act-123", is_active: false }];
    const response = await GET(makeRequest());
    expect(response.status).toBe(503);
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(1);
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.fetchMetaGraph).not.toHaveBeenCalled();
  });

  it("ne retente pas et n’expose pas l’erreur si un GET Graph échoue", async () => {
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
