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
  pickBestMetaInterest: vi.fn(),
  rankMetaInterestCandidates: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/api", () => ({ searchMetaInterests: mocks.searchMetaInterests }));
vi.mock("@/lib/ad-campaigns/meta-targeting", () => ({
  normalizeInterestLabel: mocks.normalizeInterestLabel,
  buildInterestSearchQueries: mocks.buildInterestSearchQueries,
  pickBestMetaInterest: mocks.pickBestMetaInterest,
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
  mocks.pickBestMetaInterest.mockImplementation((label: string, candidates: Array<{ id: string; name: string }>) => {
    const match = candidates.find((item) => item.name.toLowerCase() === label.toLowerCase());
    return match ? { interest: { id: match.id, name: match.name }, confidence: "exact" } : null;
  });
  mocks.rankMetaInterestCandidates.mockImplementation((_label: string, candidates: unknown[], limit: number) => candidates.slice(0, limit));
  mocks.searchMetaInterests.mockResolvedValue([]);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/integrations/meta/interest-resolve", () => {
  it("stops after the full-label query when the match is exact, with no suggestions", async () => {
    mocks.searchMetaInterests.mockResolvedValue([{ id: "101", name: "Jazz" }]);

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      results: [{ label: "Jazz", selected: { id: "101", name: "Jazz" }, confidence: "exact", suggestions: [] }],
    });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(1);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token");
    expect(mocks.buildInterestSearchQueries).not.toHaveBeenCalled();
    expect(mocks.decryptSecret).toHaveBeenCalledWith("cipher");
  });

  it("stops after the first query on a base match (Meta disambiguation in parentheses)", async () => {
    mocks.searchMetaInterests.mockResolvedValue([{ id: "501", name: "Parentalité (enfants et parents)" }]);
    mocks.pickBestMetaInterest.mockReturnValue({ interest: { id: "501", name: "Parentalité (enfants et parents)" }, confidence: "base" });

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Parentalité"] }));
    expect(await responseJson(response)).toEqual({
      results: [{ label: "Parentalité", selected: { id: "501", name: "Parentalité (enfants et parents)" }, confidence: "base", suggestions: [] }],
    });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(1);
    expect(mocks.buildInterestSearchQueries).not.toHaveBeenCalled();
  });

  it("passes fr_FR to Meta only when explicitly requested for measurement", async () => {
    mocks.searchMetaInterests.mockResolvedValue([{ id: "101", name: "Jazz" }]);
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"], locale: "fr_FR" }));
    expect(response.status).toBe(200);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token", { locale: "fr_FR" });
  });

  it("runs the fallback queries only when the first query gives neither exact nor base, and returns the close confidence", async () => {
    mocks.searchMetaInterests.mockImplementation(async (query: string) => query === "Jazz token"
      ? [{ id: "201", name: "Jazz (musique)" }]
      : []);
    mocks.pickBestMetaInterest.mockImplementation((_label: string, candidates: Array<{ id: string; name: string }>) =>
      candidates.length ? { interest: { id: "201", name: "Jazz (musique)" }, confidence: "close" } : null);

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(await responseJson(response)).toEqual({
      results: [{ label: "Jazz", selected: { id: "201", name: "Jazz (musique)" }, confidence: "close", suggestions: [] }],
    });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(2);
    expect(mocks.searchMetaInterests).toHaveBeenNthCalledWith(1, "Jazz", "secret-token");
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz token", "secret-token");
    expect(mocks.pickBestMetaInterest).toHaveBeenCalledTimes(2);
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, adapted: 1, suggested: 0, failed: 0 });
  });

  it("returns null selected, null confidence and at most 3 ranked suggestions when nothing matches", async () => {
    mocks.searchMetaInterests.mockResolvedValue([
      { id: "301", name: "Jazz festivals" }, { id: "302", name: "Jazz club" }, { id: "303", name: "Jazz piano" }, { id: "304", name: "Jazz guitar" },
    ]);

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz fusion"] }));
    const json = await responseJson(response);
    expect(json.results[0]).toMatchObject({ label: "Jazz fusion", selected: null, confidence: null });
    expect(json.results[0].suggestions).toHaveLength(3);
    expect(mocks.rankMetaInterestCandidates).toHaveBeenCalledWith("Jazz fusion", expect.any(Array), 3);
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, adapted: 0, suggested: 1, failed: 0 });
  });

  it("continues when the first query rejects but a fallback query succeeds", async () => {
    mocks.searchMetaInterests.mockImplementation(async (query: string) => {
      if (query === "Yoga") throw new Error("private error");
      return [{ id: "401", name: "Yoga" }];
    });

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Yoga"] }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      results: [{ label: "Yoga", selected: { id: "401", name: "Yoga" }, confidence: "exact", suggestions: [] }],
    });
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 1, adapted: 0, suggested: 0, failed: 1 });
  });

  it("returns 502 only when every individual search rejects", async () => {
    mocks.searchMetaInterests.mockRejectedValue(new Error("private error"));

    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(502);
    expect(await responseJson(response)).toEqual({ code: "META_INTEREST_SEARCH_FAILED", error: "Impossible de vérifier les centres d’intérêt auprès de Meta." });
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, adapted: 0, suggested: 0, failed: 2 });
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
