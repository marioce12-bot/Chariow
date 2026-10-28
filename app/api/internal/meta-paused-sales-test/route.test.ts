import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  claimInsert: vi.fn(),
  decryptSecret: vi.fn(),
  createMetaCampaign: vi.fn(),
  createMetaAdSet: vi.fn(),
  createMetaAd: vi.fn(),
  activateMetaCampaign: vi.fn(),
  publishMetaAdWithAdvantage: vi.fn(),
  getMetaGrantedPermissions: vi.fn(),
  readMetaPausedTestCampaign: vi.fn(),
  readMetaPausedTestAdSet: vi.fn(),
  readMetaPausedTestObjectStatus: vi.fn(),
  fetchMetaAccountStatus: vi.fn(),
  isMetaAccountStatusBlocking: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/campaigns", () => ({
  createMetaCampaign: mocks.createMetaCampaign,
  createMetaAdSet: mocks.createMetaAdSet,
  createMetaAd: mocks.createMetaAd,
  activateMetaCampaign: mocks.activateMetaCampaign,
  publishMetaAdWithAdvantage: mocks.publishMetaAdWithAdvantage,
}));
vi.mock("@/lib/meta/api", () => ({
  fetchMetaAccountStatus: mocks.fetchMetaAccountStatus,
  isMetaAccountStatusBlocking: mocks.isMetaAccountStatusBlocking,
}));
vi.mock("@/lib/meta/paused-sales-website-test", () => ({
  getMetaGrantedPermissions: mocks.getMetaGrantedPermissions,
  readMetaPausedTestCampaign: mocks.readMetaPausedTestCampaign,
  readMetaPausedTestAdSet: mocks.readMetaPausedTestAdSet,
  readMetaPausedTestObjectStatus: mocks.readMetaPausedTestObjectStatus,
}));

import { POST } from "./route";

const previousEnabled = process.env.META_PAUSED_SALES_TEST_ENABLED;
const previousUserId = process.env.META_PAUSED_SALES_TEST_USER_ID;
const previousVercelEnv = process.env.VERCEL_ENV;
const confirmation = "CREATE_PAUSED_SALES_WEBSITE_TEST_NO_AD";

function makeQuery(result: { data: unknown; error: null }) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.limit = vi.fn().mockResolvedValue(result);
  return query;
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request("https://vendeo.test/api/internal/meta-paused-sales-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      confirmation,
      meta_ad_account_row_id: "account-row-1",
      daily_budget: 2,
      country: "BJ",
      ...body,
    }),
  });
}

function pausedCampaign(id = "campaign-1") {
  return { id, status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_SALES" };
}

function pausedAdSet(id = "adset-1") {
  return {
    id,
    status: "PAUSED",
    effectiveStatus: "CAMPAIGN_PAUSED",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    destinationType: "WEBSITE",
    customEventType: "PURCHASE",
    publisherPlatforms: ["instagram", "whatsapp"],
    whatsappPositions: ["status"],
    instagramPositions: ["story"],
    userAgeUnknown: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_ENV = "preview";
  process.env.META_PAUSED_SALES_TEST_ENABLED = "true";
  process.env.META_PAUSED_SALES_TEST_USER_ID = "user-1";

  const accountQuery = makeQuery({ data: {
    id: "account-row-1",
    meta_account_id: "123",
    access_token_encrypted: "encrypted-token",
    is_active: true,
  }, error: null });
  const pixelQuery = makeQuery({ data: [{ pixel_id: "pixel-1", configured_on_chariow: true, last_fired_at: null }], error: null });
  const supabase = { from: vi.fn((table: string) => table === "meta_ad_accounts" ? accountQuery : pixelQuery) };
  const claimQuery = { insert: mocks.claimInsert };
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => claimQuery) });
  mocks.requireUser.mockResolvedValue({ supabase, user: { id: "user-1" }, response: null });
  mocks.claimInsert.mockResolvedValue({ error: null });
  mocks.decryptSecret.mockReturnValue("access-token");
  mocks.getMetaGrantedPermissions.mockResolvedValue(new Set(["ads_management", "ads_read"]));
  mocks.fetchMetaAccountStatus.mockResolvedValue(1);
  mocks.isMetaAccountStatusBlocking.mockReturnValue(false);
  mocks.createMetaCampaign.mockResolvedValue({ id: "campaign-1", objective: "OUTCOME_SALES" });
  mocks.createMetaAdSet.mockResolvedValue({ id: "adset-1" });
  mocks.readMetaPausedTestCampaign.mockResolvedValue(pausedCampaign());
  mocks.readMetaPausedTestAdSet.mockResolvedValue(pausedAdSet());
  mocks.readMetaPausedTestObjectStatus.mockImplementation(async (id: string) => ({
    id,
    status: "PAUSED",
    effectiveStatus: id === "campaign-1" ? "PAUSED" : "CAMPAIGN_PAUSED",
  }));
});

afterEach(() => {
  if (previousEnabled === undefined) delete process.env.META_PAUSED_SALES_TEST_ENABLED;
  else process.env.META_PAUSED_SALES_TEST_ENABLED = previousEnabled;
  if (previousUserId === undefined) delete process.env.META_PAUSED_SALES_TEST_USER_ID;
  else process.env.META_PAUSED_SALES_TEST_USER_ID = previousUserId;
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
});

describe("POST /api/internal/meta-paused-sales-test", () => {
  it("reste fermée par défaut sans authentifier ni appeler Meta", async () => {
    process.env.META_PAUSED_SALES_TEST_ENABLED = "false";
    const response = await POST(makeRequest());
    expect(response.status).toBe(404);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.getMetaGrantedPermissions).not.toHaveBeenCalled();
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
  });

  it("reste fermée en Production même si le flag est actif", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(makeRequest());
    expect(response.status).toBe(404);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur hors liste blanche avant toute vérification Meta", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: { id: "other-user" }, supabase: { from: vi.fn() }, response: null });
    const response = await POST(makeRequest());
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.claimInsert).not.toHaveBeenCalled();
    expect(mocks.getMetaGrantedPermissions).not.toHaveBeenCalled();
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
  });

  it("exige une confirmation exacte et n’accepte aucun paramètre de statut ou d’objectif du client", async () => {
    const response = await POST(makeRequest({ confirmation: "", status: "PAUSED", objective: "sales" }));
    expect(response.status).toBe(400);
    expect(mocks.getMetaGrantedPermissions).not.toHaveBeenCalled();
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
  });

  it("s’arrête avant création si ads_management ou ads_read manque", async () => {
    mocks.getMetaGrantedPermissions.mockResolvedValueOnce(new Set(["ads_read"]));
    const response = await POST(makeRequest());
    expect(response.status).toBe(403);
    expect(mocks.fetchMetaAccountStatus).not.toHaveBeenCalled();
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
  });

  it("s’arrête avant création si Meta ne permet pas de lire les permissions", async () => {
    mocks.getMetaGrantedPermissions.mockRejectedValueOnce(new Error("permissions unreadable"));
    const response = await POST(makeRequest());
    expect(response.status).toBe(403);
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
  });

  it("refuse une seconde exécution lorsque la clé unique est déjà utilisée", async () => {
    mocks.claimInsert.mockResolvedValueOnce({ error: { code: "23505" } });
    const response = await POST(makeRequest());
    expect(response.status).toBe(409);
    expect(mocks.claimInsert).toHaveBeenCalledWith({ test_key: "meta-paused-sales-whatsapp-status-preview-v1", user_id: "user-1" });
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
  });

  it("échoue avant création si le verrou à usage unique est absent ou indisponible", async () => {
    mocks.claimInsert.mockResolvedValueOnce({ error: { code: "42P01" } });
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect(mocks.createMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
  });

  it("crée uniquement campagne et ad set en PAUSED, vérifie le payload WhatsApp Status/Instagram Stories et ne crée aucune annonce", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      ad_created: false,
      campaign: { id: "campaign-1", objective: "OUTCOME_SALES", status: "PAUSED" },
      ad_set: { id: "adset-1", status: "PAUSED", optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE", custom_event_type: "PURCHASE", publisher_platforms: ["instagram", "whatsapp"], whatsapp_positions: ["status"], instagram_positions: ["story"], user_age_unknown: false },
    });
    expect(mocks.createMetaCampaign).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "act_123",
      objective: "sales",
      dailyBudget: 2,
      status: "PAUSED",
    }));
    expect(mocks.createMetaAdSet).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "act_123",
      campaignId: "campaign-1",
      objective: "sales",
      pixelId: "pixel-1",
      status: "PAUSED",
      deferPostCreateValidation: true,
      publisherPlatforms: ["instagram", "whatsapp"],
      whatsappStatusTestPlacement: true,
    }));
    expect(mocks.claimInsert).toHaveBeenCalledWith({ test_key: "meta-paused-sales-whatsapp-status-preview-v1", user_id: "user-1" });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.claimInsert.mock.invocationCallOrder[0]).toBeLessThan(mocks.createMetaCampaign.mock.invocationCallOrder[0]);
    expect(mocks.readMetaPausedTestCampaign).toHaveBeenCalledTimes(2);
    expect(mocks.readMetaPausedTestAdSet).toHaveBeenCalledTimes(1);
    expect(mocks.readMetaPausedTestObjectStatus).toHaveBeenCalledTimes(2);
    expect(mocks.readMetaPausedTestCampaign.mock.invocationCallOrder[0]).toBeLessThan(mocks.createMetaAdSet.mock.invocationCallOrder[0]);
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
    expect(mocks.activateMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.publishMetaAdWithAdvantage).not.toHaveBeenCalled();
  });

  it("garde les objets et renvoie IDs/derniers états si le readback du placement échoue", async () => {
    mocks.readMetaPausedTestAdSet.mockResolvedValueOnce({ ...pausedAdSet(), whatsappPositions: ["feed"] });
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      verified: false,
      ad_created: false,
      campaign: { id: "campaign-1", last_observed_status: "PAUSED", current_state_verified: false },
      ad_set: { id: "adset-1", last_observed_status: "PAUSED", last_observed_effective_status: "CAMPAIGN_PAUSED", current_state_verified: false },
    });
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
    expect(mocks.activateMetaCampaign).not.toHaveBeenCalled();
    expect(mocks.publishMetaAdWithAdvantage).not.toHaveBeenCalled();
  });

  it("ne crée pas l’ad set si le statut PAUSED de la campagne n’est pas confirmé", async () => {
    mocks.readMetaPausedTestCampaign.mockResolvedValueOnce({ ...pausedCampaign(), status: "ACTIVE", effectiveStatus: "ACTIVE" });
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
    expect(mocks.activateMetaCampaign).not.toHaveBeenCalled();
  });

  it("s’arrête sans annonce si la lecture de l’état campagne échoue", async () => {
    mocks.readMetaPausedTestCampaign.mockRejectedValueOnce(new Error("state unavailable"));
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
  });

  it("s’arrête sans annonce si l’état de l’ad set n’est pas vérifiable", async () => {
    mocks.readMetaPausedTestAdSet.mockRejectedValueOnce(new Error("ad set state unavailable"));
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.readMetaPausedTestObjectStatus).not.toHaveBeenCalled();
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
  });

  it("s’arrête sans annonce si Meta ne confirme pas la destination ou l’optimisation", async () => {
    mocks.readMetaPausedTestAdSet.mockResolvedValueOnce({ ...pausedAdSet(), destinationType: "WHATSAPP" });
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.readMetaPausedTestObjectStatus).not.toHaveBeenCalled();
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
  });

  it("refuse un état effectif inconnu même si status indique PAUSED", async () => {
    mocks.readMetaPausedTestCampaign.mockResolvedValueOnce({ ...pausedCampaign(), effectiveStatus: "SCHEDULED" });
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.createMetaAdSet).not.toHaveBeenCalled();
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
  });

  it("renvoie une erreur si le statut change avant la vérification finale", async () => {
    mocks.readMetaPausedTestObjectStatus.mockImplementation(async (id: string) => ({
      id,
      status: id === "adset-1" ? "ACTIVE" : "PAUSED",
      effectiveStatus: id === "adset-1" ? "ACTIVE" : "PAUSED",
    }));
    const response = await POST(makeRequest());
    expect(response.status).toBe(502);
    expect(mocks.createMetaAd).not.toHaveBeenCalled();
    expect(mocks.activateMetaCampaign).not.toHaveBeenCalled();
  });
});
