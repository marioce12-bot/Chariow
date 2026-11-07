import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), decryptSecret: vi.fn(),
  searchMetaInterests: vi.fn(), normalizeInterestLabel: vi.fn(), buildInterestSearchQueries: vi.fn(), pickBestMetaInterest: vi.fn(), rankMetaInterestCandidates: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/api", () => ({ searchMetaInterests: mocks.searchMetaInterests }));
vi.mock("@/lib/ad-campaigns/meta-targeting", () => ({
  normalizeInterestLabel: mocks.normalizeInterestLabel, buildInterestSearchQueries: mocks.buildInterestSearchQueries,
  pickBestMetaInterest: mocks.pickBestMetaInterest, rankMetaInterestCandidates: mocks.rankMetaInterestCandidates,
}));
import { POST } from "./route";

const account = { id: "act-1", access_token_encrypted: "cipher" };
const jsonRequest = (body: unknown) => new Request("https://example.test/api/integrations/meta/interest-resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const responseJson = (response: Response) => response.json();
const exact = { id: "101", name: "Jazz" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: mocks.from } });
  mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle }); mocks.maybeSingle.mockResolvedValue({ data: account });
  mocks.decryptSecret.mockReturnValue("secret-token");
  mocks.normalizeInterestLabel.mockImplementation((label: string) => label.toLowerCase());
  mocks.buildInterestSearchQueries.mockImplementation((label: string) => [label, `${label} music`, `${label} culture`]);
  mocks.searchMetaInterests.mockResolvedValue([]);
  mocks.pickBestMetaInterest.mockImplementation((_label: string, candidates: Array<{ id: string; name: string }>) => {
    const interest = candidates.find((item) => item.name.toLowerCase() === String(_label).toLowerCase()) ?? null;
    return interest ? { interest, confidence: "exact" } : null;
  });
  mocks.rankMetaInterestCandidates.mockImplementation((_label: string, candidates: Array<{ id: string; name: string }>, limit: number) => candidates.slice(0, limit));
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/integrations/meta/interest-resolve", () => {
  it("returns exact selection and skips fallback after first query", async () => {
    mocks.searchMetaInterests.mockResolvedValue([exact]);
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ results: [{ label: "Jazz", selected: exact, confidence: "exact", suggestions: [] }] });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(1);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token");
    expect(mocks.decryptSecret).toHaveBeenCalledWith("cipher");
  });

  it("does not fallback for base confidence", async () => {
    mocks.searchMetaInterests.mockResolvedValue([exact]);
    mocks.pickBestMetaInterest.mockReturnValue({ interest: exact, confidence: "base" });
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect((await responseJson(response)).results[0].confidence).toBe("base");
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(1);
  });

  it("runs fallback queries in parallel and re-picks on merged unique ids", async () => {
    const fallback = { id: "202", name: "Jazz music" };
    mocks.searchMetaInterests.mockImplementation(async (query: string) => query === "Jazz" ? [{ id: "201", name: "Jazzy" }] : [fallback, { id: "201", name: "duplicate" }]);
    mocks.pickBestMetaInterest.mockReturnValueOnce(null).mockReturnValueOnce({ interest: fallback, confidence: "close" });
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(await responseJson(response)).toEqual({ results: [{ label: "Jazz", selected: fallback, confidence: "close", suggestions: [] }] });
    expect(mocks.searchMetaInterests).toHaveBeenCalledTimes(3);
    expect(mocks.pickBestMetaInterest).toHaveBeenNthCalledWith(2, "Jazz", [{ id: "201", name: "Jazzy" }, fallback]);
  });

  it("returns at most three suggestions only when there is no selection", async () => {
    mocks.searchMetaInterests.mockResolvedValue([{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }, { id: "4", name: "D" }, { id: "5", name: "E" }]);
    mocks.pickBestMetaInterest.mockReturnValue(null);
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect((await responseJson(response)).results[0].suggestions).toHaveLength(3);
    expect(mocks.rankMetaInterestCandidates).toHaveBeenCalledWith("Jazz", expect.any(Array), 3);
  });

  it("leaves selected null and suggestions empty when the catalogue returns no candidates", async () => {
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Conseils parentaux"] }));
    expect(await responseJson(response)).toEqual({ results: [{ label: "Conseils parentaux", selected: null, confidence: null, suggestions: [] }] });
    expect(mocks.pickBestMetaInterest).toHaveBeenLastCalledWith("Conseils parentaux", []);
  });

  it("includes locale only when fr_FR is requested", async () => {
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"], locale: "fr_FR" }));
    expect(response.status).toBe(200);
    expect(mocks.searchMetaInterests).toHaveBeenCalledWith("Jazz", "secret-token", { locale: "fr_FR" });
  });

  it("continues after partial failures and logs privacy-safe counters", async () => {
    mocks.buildInterestSearchQueries.mockReturnValue(["Yoga", "yoga music"]);
    mocks.searchMetaInterests.mockImplementation(async (query: string) => { if (query === "Yoga") throw Error("private"); return [{ id: "401", name: "Yoga" }]; });
    mocks.pickBestMetaInterest.mockReturnValue(null);
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Yoga"] }));
    expect(response.status).toBe(200);
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, adapted: 0, suggested: 1, failed: 1 });
  });

  it("returns 502 if all searches reject", async () => {
    mocks.searchMetaInterests.mockRejectedValue(new Error("private"));
    const response = await POST(jsonRequest({ accountId: "act-1", labels: ["Jazz"] }));
    expect(response.status).toBe(502);
    expect(await responseJson(response)).toEqual({ code: "META_INTEREST_SEARCH_FAILED", error: "Impossible de vérifier les centres d’intérêt auprès de Meta." });
    expect(console.info).toHaveBeenCalledWith("meta_interest_resolve", { requested: 1, exact: 0, adapted: 0, suggested: 0, failed: 3 });
  });

  it("returns 400 for unknown account and does not search", async () => {
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
