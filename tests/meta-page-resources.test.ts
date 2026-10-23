import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMetaResources } from "../lib/meta/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMetaResources", () => {
  it("récupère compte, pages et pixels via GET avec le token du compte", async () => {
    const responses = [
      { id: "act_123", name: "Compte", account_status: 1 },
      { data: [{ id: "page_1", name: "Page", access_token: "page-token" }] },
      { data: [{ id: "pixel_1", name: "Pixel" }] },
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(responses.shift()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMetaResources("act_123", "account-token");

    expect(result.account).toMatchObject({ id: "act_123", name: "Compte" });
    expect(result.pages).toEqual([{ id: "page_1", name: "Page", access_token: "page-token" }]);
    expect(result.pixels).toEqual([{ id: "pixel_1", name: "Pixel" }]);
    expect(result.pagesError).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requests = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(requests.map((url) => url.pathname)).toEqual([
      "/v23.0/act_123",
      "/v23.0/me/accounts",
      "/v23.0/act_123/adspixels",
    ]);
    for (const url of requests) expect(url.searchParams.get("access_token")).toBe("account-token");
    expect(requests.map((url) => url.searchParams.get("fields"))).toEqual([
      "id,name,account_status,currency",
      "id,name,access_token,instagram_business_account",
      "id,name",
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined || init.method === "GET")).toBe(true);
  });

  it("conserve les pages et pixels même si le compte refuse l'accès", async () => {
    const responses = [
      { error: { message: "Compte inaccessible" } },
      { data: [{ id: "page_2", name: "Page conservée" }] },
      { data: [{ id: "pixel_2", name: "Pixel conservé" }] },
    ];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      const body = responses[call++];
      return new Response(JSON.stringify(body), { status: call === 1 ? 403 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMetaResources("act_456", "account-token");

    expect(result.account).toEqual({});
    expect(result.accountError).toBe("Compte inaccessible");
    expect(result.pages).toEqual([{ id: "page_2", name: "Page conservée" }]);
    expect(result.pixels).toEqual([{ id: "pixel_2", name: "Pixel conservé" }]);
  });
});
