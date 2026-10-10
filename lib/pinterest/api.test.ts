import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchPinterest, pinterestExceptionMessage, toPinterestObjective } from "./api";

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];

function mockPinterest(handler: (call: Call) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url).replace("https://api.pinterest.com/v5", ""), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const payload = handler(call);
    return { ok: true, status: 200, json: async () => payload } as Response;
  }));
}

const input = { adAccountId: "123", accessToken: "tok", name: "Promo", adText: "Texte", title: "Titre", link: "https://shop.example/p", mediaUrl: "https://img.example/a.jpg", dailyBudget: 5, durationDays: 3, minAge: 18, maxAge: 45, countries: ["BJ"], objective: "sales" };

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

function happyPath(currency = "USD") {
  return (call: Call) => {
    if (call.method === "GET" && call.url === "/ad_accounts/123") return { id: "123", currency };
    if (call.url.endsWith("/campaigns") && call.method === "POST") return { items: [{ data: { id: "c1" } }] };
    if (call.url.endsWith("/ad_groups")) return { items: [{ data: { id: "g1" } }] };
    if (call.url.startsWith("/pins")) return { id: "p1" };
    if (call.url.endsWith("/ads")) return { items: [{ data: { id: "a1" } }] };
    if (call.method === "PATCH") return { items: [{ data: { id: "c1" } }] };
    return {};
  };
}

describe("pinterestExceptionMessage", () => {
  it("lit le tableau `exceptions` renvoyé par l'API batch", () => {
    expect(pinterestExceptionMessage([{ code: 2, message: "Advertiser not found." }])).toBe("Advertiser not found.");
  });
  it("accepte l'ancien objet `exception` avec error_messages", () => {
    expect(pinterestExceptionMessage({ error_messages: ["a", "b"] })).toBe("a b");
  });
  it("renvoie null sans erreur", () => {
    expect(pinterestExceptionMessage(undefined)).toBeNull();
    expect(pinterestExceptionMessage([])).toBeNull();
  });
});

describe("toPinterestObjective", () => {
  it("sales → SALES, le reste → CONSIDERATION", () => {
    expect(toPinterestObjective("sales")).toBe("SALES");
    expect(toPinterestObjective("traffic")).toBe("CONSIDERATION");
    expect(toPinterestObjective(undefined)).toBe("CONSIDERATION");
  });
});

describe("launchPinterest", () => {
  it("crée campagne → groupe → pin → annonce avec les bons paramètres", async () => {
    mockPinterest(happyPath());
    const result = await launchPinterest(input);
    expect(result).toEqual({ campaignId: "c1", adGroupId: "g1", pinId: "p1", adId: "a1" });
    const campaign = calls.find((c) => c.url.endsWith("/campaigns"))!.body[0];
    expect(campaign).toMatchObject({ objective_type: "SALES", daily_spend_cap: 5_000_000, is_campaign_budget_optimization: true });
    const adGroup = calls.find((c) => c.url.endsWith("/ad_groups"))!.body[0];
    expect(adGroup.targeting_spec.LOCATION).toEqual(["BJ"]);
    expect(adGroup.targeting_spec.GEO).toBeUndefined();
    const pin = calls.find((c) => c.url.startsWith("/pins"))!.body;
    expect(pin.is_removable).toBeUndefined();
  });

  it("convertit le budget USD dans la devise du compte (XOF)", async () => {
    mockPinterest(happyPath("XOF"));
    await launchPinterest(input);
    const cap = calls.find((c) => c.url.endsWith("/campaigns") && c.method === "POST")!.body[0].daily_spend_cap;
    expect(cap).toBeGreaterThan(2_000 * 1_000_000); // 5 $ ≈ 2 800 F CFA
    expect(cap).toBeLessThan(4_000 * 1_000_000);
  });

  it("refuse une devise de compte inconnue avant de créer quoi que ce soit", async () => {
    mockPinterest(happyPath("JPY"));
    await expect(launchPinterest(input)).rejects.toThrow(/JPY/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("archive la campagne si une étape suivante échoue et remonte l'erreur d'origine", async () => {
    const ok = happyPath();
    mockPinterest((call) => call.url.endsWith("/ad_groups") ? { items: [{ exceptions: [{ code: 1, message: "Targeting invalide" }] }] } : ok(call));
    await expect(launchPinterest(input)).rejects.toThrow("Targeting invalide");
    const archive = calls.find((c) => c.method === "PATCH")!;
    expect(archive.url).toBe("/ad_accounts/123/campaigns");
    expect(archive.body).toEqual([{ id: "c1", status: "ARCHIVED" }]);
  });
});
