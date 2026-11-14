import { describe, expect, it } from "vitest";
import { launchPack, packProgress, splitPackBudget, splitPackBudgetCents, validatePackInput, type PackAdapter, type PackCheckpoint, type PackInput } from "./ad-variant-packs";

const valid: PackInput = { client_request_id: "req-1", store_id: "123e4567-e89b-42d3-a456-426614174000", product_id: "p1", product_name: "P", destination_url: "https://shop.example/p", meta_ad_account_id: "123e4567-e89b-42d3-a456-426614174001", meta_page_id: "page1", dsa_beneficiary: "Approved beneficiary", dsa_payor: "Approved payer", countries: ["FR"], geo_targeting: {}, meta_targeting: {}, advantage_audience: false, min_age: 18, max_age: 65, daily_budget: 10, duration_days: 7, variants: ["a", "b", "c"].map((id) => ({ id, angle: id, format: "image", text: "copy", media: ["https://cdn.example/ad.jpg"], call_to_action: "SHOP_NOW" })) };

type Fake = PackAdapter & { events: string[]; campaignParents: string[]; created: Record<string, number>; claimed: boolean };
function fakeAdapter(verify: { store: boolean; account: boolean; page: boolean; media: boolean; pixelCheck: "present" | "none"; pixelId?: string; exhaustivePixelList: boolean } = { store: true, account: true, page: true, media: true, pixelCheck: "present", pixelId: "pixel-1", exhaustivePixelList: true }): Fake {
  const f: Fake = {
    events: [], campaignParents: [], created: {}, claimed: false,
    async claim() { if (f.claimed) return false; f.claimed = true; return true; },
    async verify() { return verify; },
    async save(cp, patch) { f.events.push(`save:${patch?.status ?? Object.keys(cp).join(",")}`); },
    async createCampaign(input) { f.created.campaign = (f.created.campaign ?? 0) + 1; f.events.push(`campaign:${input.status}:${input.objective}`); return "campaign-1"; },
    async createAdSet(input) { f.created.adset = (f.created.adset ?? 0) + 1; f.campaignParents.push(input.campaignId); f.events.push(`adset:${input.budgetCents}`); return `set-${f.created.adset}`; },
    async createCreative({ variant }) { f.created.creative = (f.created.creative ?? 0) + 1; f.events.push(`creative:${variant.call_to_action}`); return `creative-${f.created.creative}`; },
    async createAd({ adsetId, creativeId }) { f.created.ad = (f.created.ad ?? 0) + 1; f.events.push(`ad:${adsetId}:${creativeId}`); return `ad-${f.created.ad}`; },
    async activateParent(id) { f.events.push(`activate:${id}`); },
  };
  return f;
}

describe("ad variant packs backend contract", () => {
  it("requires exactly three unique variants with allowed CTA and propagates their value unchanged", () => {
    expect(validatePackInput(valid)).toBeNull();
    expect(valid.variants.map((v) => v.call_to_action)).toEqual(["SHOP_NOW", "SHOP_NOW", "SHOP_NOW"]);
    expect(validatePackInput({ ...valid, variants: valid.variants.slice(0, 2) })).toMatch(/trois/);
    expect(validatePackInput({ ...valid, variants: valid.variants.map((v, i) => i ? v : { ...v, call_to_action: "MESSAGE" as any }) })).toMatch(/CTA/);
  });
  it("requires two non-empty DSA names of at most 200 characters", () => {
    for (const field of ["dsa_beneficiary", "dsa_payor"]) {
      for (const value of ["", "  ", "x".repeat(201)]) expect(validatePackInput({ ...valid, [field]: value })).toMatch(/DSA/);
      expect(validatePackInput({ ...valid, [field]: "x".repeat(200) })).toBeNull();
    }
  });
  it("fails closed for bad URLs, media, countries, spend bounds and ambiguous formats", () => {
    expect(validatePackInput({ ...valid, destination_url: "http://shop.example" })).toMatch(/HTTPS/);
    expect(validatePackInput({ ...valid, variants: valid.variants.map((v, i) => i ? v : { ...v, media: [] }) })).toMatch(/médias|exactement/);
    expect(validatePackInput({ ...valid, variants: valid.variants.map((v, i) => i ? v : { ...v, media: ["https://a", "https://b"] }) })).toMatch(/exactement/);
    expect(validatePackInput({ ...valid, variants: valid.variants.map((v, i) => i ? v : { ...v, format: "carousel", media: ["https://a"] }) })).toMatch(/carrousel/);
    expect(validatePackInput({ ...valid, countries: ["France"] })).toMatch(/Pays/);
    expect(validatePackInput({ ...valid, daily_budget: 2 })).toMatch(/Budget/);
  });
  it("splits total spend into exact integer cents", () => {
    expect(splitPackBudget(10)).toEqual([3.34, 3.33, 3.33]);
    expect(splitPackBudgetCents(10).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitPackBudget(3)).toEqual([1, 1, 1]);
    expect(() => splitPackBudget(2.99)).toThrow();
  });
  it("creates one paused shared parent, exactly 3 sets/creatives/ads, identical CTA and activates last", async () => {
    const a = fakeAdapter();
    const result = await launchPack({ pack: valid, pageId: "page1", adapter: a });
    expect(a.events[a.events.indexOf("campaign:PAUSED:sales") - 1]).toContain("save:");
    expect(a.created).toEqual({ campaign: 1, adset: 3, creative: 3, ad: 3 });
    expect(a.campaignParents).toEqual(["campaign-1", "campaign-1", "campaign-1"]);
    expect(a.events.filter((x) => x.startsWith("adset:"))).toEqual(["adset:334", "adset:333", "adset:333"]);
    expect(a.events.filter((x) => x.startsWith("creative:"))).toEqual(Array(3).fill("creative:SHOP_NOW"));
    expect(a.events.at(-2)).toBe("activate:campaign-1");
    expect(result.activated).toBe(true);
  });
  it("blocks campaign creation on pixel-list error/incompleteness and on failed ownership/media checks", async () => {
    for (const verify of [
      { store: true, account: true, page: true, media: true, pixelCheck: "none" as const, exhaustivePixelList: false },
      { store: true, account: true, page: true, media: true, pixelCheck: "present" as const, pixelId: "pixel", exhaustivePixelList: false },
      { store: true, account: true, page: false, media: true, pixelCheck: "none" as const, exhaustivePixelList: true },
    ]) {
      const a = fakeAdapter(verify);
      await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow();
      expect(a.created.campaign).toBeUndefined();
    }
  });
  it("records a preflight failure as blocked before any external creation", async () => {
    const a = fakeAdapter({ store: false, account: true, page: true, media: true, pixelCheck: "none", exhaustivePixelList: true });
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow();
    expect(a.created.campaign).toBeUndefined();
    expect(a.events.at(-1)).toMatch(/^save:blocked$/);
  });
  it("treats an empty exhaustive pixel list as traffic, but never treats a Graph/pagination failure as empty", async () => {
    const a = fakeAdapter({ store: true, account: true, page: true, media: true, pixelCheck: "none", exhaustivePixelList: true });
    await launchPack({ pack: valid, pageId: "page1", adapter: a });
    expect(a.events[a.events.indexOf("campaign:PAUSED:traffic") - 1]).toContain("save:");
  });
  it("claim is single-use under concurrency", async () => {
    const a = fakeAdapter();
    const outcomes = await Promise.allSettled([launchPack({ pack: valid, pageId: "page1", adapter: a }), launchPack({ pack: valid, pageId: "page1", adapter: a })]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(a.created.campaign).toBe(1);
  });
  it("does not retry after an external timeout or checkpoint persistence failure", async () => {
    const timed = fakeAdapter();
    timed.createCreative = async () => { timed.created.creative = 1; throw new Error("timeout after external result ambiguous"); };
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: timed })).rejects.toThrow(/timeout/);
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: timed })).rejects.toThrow(/déjà réclamé/);
    expect(timed.created.campaign).toBe(1);

    const persisted = fakeAdapter(); let saves = 0;
    persisted.save = async (_cp: PackCheckpoint) => { if (++saves === 3) throw new Error("db timeout after campaign effect"); };
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: persisted })).rejects.toThrow(/db timeout/);
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: persisted })).rejects.toThrow(/déjà réclamé/);
    expect(persisted.created.campaign).toBe(1);
  });
  it("reports 100 only for completed persisted activation", () => {
    expect(packProgress({ activated: true }, "ambiguous")).toBeLessThan(100);
    expect(packProgress({ activated: true }, "claimed")).toBeLessThan(100);
    expect(packProgress({ activated: true }, "completed")).toBe(100);
  });
  it("never retries when persisting the activation result fails", async () => {
    const a = fakeAdapter(); let saves = 0;
    a.save = async (_cp: PackCheckpoint, patch) => { if (++saves === 22 && patch?.status === "completed") throw new Error("activation checkpoint timeout"); };
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow(/activation checkpoint/);
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow(/déjà réclamé/);
    expect(a.created).toEqual({ campaign: 1, adset: 3, creative: 3, ad: 3 });
    expect(a.events.filter((event) => event.startsWith("activate:"))).toHaveLength(1);
  });
});
