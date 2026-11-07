import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  decryptSecret: vi.fn(),
  searchMetaInterests: vi.fn(),
  normalizeInterestLabel: vi.fn(),
  buildInterestSearchQueries: vi.fn(),
  resolveExactMetaInterests: vi.fn(),
  rankMetaInterestCandidates: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/api", () => ({ searchMetaInterests: mocks.searchMetaInterests }));
vi.mock("@/lib/ad-campaigns/meta-targeting", () => ({
  normalizeInterestLabel: mocks.normalizeInterestLabel,
  buildInterestSearchQueries: mocks.buildInterestSearchQueries,
  resolveExactMetaInterests: mocks.resolveExactMetaInterests,
  rankMetaInterestCandidates: mocks.rankMetaInterestCandidates,
}));

import { POST } from "./route";

const account = { id: "act-1", access_token_encrypted: "cipher" };
const jsonRequest = (body: unknown) => new Request("https://example.test/api/integrations/meta/interest-resolve", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const responseJson = (response: Response) => response.json();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: mocks.from } });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: account });
  mocks.decryptSecret.mockReturnValue("secret-token");
  mocks.normalizeInterestLabel.mockImplementation((label: string) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  mocks.buildInterestSearchQueries.mockImplementation((label: string) => [label, `${label} token`]);
  mocks.resolveExactMetaInterests.mockImplementation((requested: string[], candidates: Array<{ id: string; name: string }>) => ({
    resolved: candidates.filter((item) => item.name.toLowerCase() === requested[0].toLowerCase()).slice(0, 1),
    missing: [],
  }));
  mocks.rankMetaInterestCandidates.mockImplementation((_label: string, candidates: unknown[], limit: number) => candidates.slice(0, limit));
  mocks.searchMetaInterests.mockResolvedValue([]);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/integrations/meta/interest-resolve", () => {
  it("returns an exact match and does not include it in suggestions", async () => {
    mocks.searchMetaInterests.mockImplementation(async (query: string) => query === "Jazz"
      ? [{ id: "101", name: "Jazz" }]
      : [{ id: "102", name: "Jazz music" }]);

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ results: [{ label: "Jazz", exact: { id: "101", name: "Jazz" }, suggestions: [] }] });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(2);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token");
    expect(mocks.decryptSecret).toHaveBeenCalledWith("cipher");
  });

  it("passes fr_FR to Meta only when explicitly requested for measurement", async () => {
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"], locale: "fr_FR" }));
    expect(response.status).toBe(200);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token", { locale: "fr_FR" });
  });

  it("resolves an exact match found through a token-oriented query", async () => {
    mocks.searchMetaInterests.mockImplementation(async (query: string) => query.endsWith(" token")
      ? [{ id: "201", name: "Plant-based diets" }]
      : []);
    mocks.resolveExactMetaInterests.mockImplementation((requested: string[], candidates: Array<{ id: string; name: string }>) => ({
      resolved: candidates.filter((item) => item.name === requested[0]),
      missing: [],
    }));

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Plant-based diets"] }));
    expect(await responseJson(response)).toEqual({ results: [{ label: "Plant-based diets", exact: { id: "201", name: "Plant-based diets" }, suggestions: [] }] });
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Plant-based diets token", "secret-token");
  });

  it("returns ranked suggestions and null exact when no exact result exists", async () => {
    mocks.searchMetaInterests.mockResolvedValue([{ id: "301", name: "Jazz festivals" }]);
    mocks.resolveExactMetaInterests.mockReturnValue({ resolved: [], missing: ["Jazz"] });
    mocks.rankMetaInterestCandidates.mockReturnValue([{ id: "301", name: "Jazz festivals" }]);

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(await responseJson(response)).toEqual({ results: [{ label: "Jazz", exact: null, suggestions: [{ id: "301", name: "Jazz festivals" }] }] });
    expect(mocks.rankMetaInterestCandidates).toHaveBeenCalledWith("Jazz", [{ id: "301", name: "Jazz festivals" }], 5);
  });

  it("continues when one query rejects but another succeeds", async () => {
    mocks.searchMetaInterests.mockImplementation(async (query: string) => {
      if (query === "Yoga") throw new Error("private error");
      return [{ id: "401", name: "Yoga" }];
    });

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Yoga"] }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ results: [{ label: "Yoga", exact: { id: "401", name: "Yoga" }, suggestions: [] }] });
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 1, suggested: 0, failed: 1 });
  });

  it("returns 502 only when every individual search rejects", async () => {
    mocks.searchMetaInterests.mockRejectedValue(new Error("private error"));

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(502);
    expect(await responseJson(response)).toEqual({ code: "META_INTEREST_SEARCH_FAILED", error: "Impossible de vérifier les centres d’intérêt auprès de Meta." });
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, suggested: 0, failed: 2 });
  });

  it("returns the account-not-found code and scopes lookup to the authenticated user, active status, and requested id", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const response = await POST(jsonRequest({ accountId: "act-other", labels: ["Jazz"] }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ code: "META_ACCOUNT_NOT_FOUND" });
    expect(mocks.from).toHaveBeenCalledWith("meta_ad_accounts");
    expect(mocks.select).toHaveBeenCalledWith("id,access_token_encrypted");
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "is_active", true);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "id", "act-other");
    expect(mocks.searchMetaInterests).not.toHaveBeenCalled();
  });
});
