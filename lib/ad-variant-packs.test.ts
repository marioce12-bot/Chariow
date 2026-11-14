import { describe, expect, it } from "vitest";
import { launchPack, packBudgetCents, packProgress, validatePackInput, type PackAdapter, type PackCheckpoint, type PackInput } from "./ad-variant-packs";

const valid: PackInput = { client_request_id: "req-1", store_id: "123e4567-e89b-42d3-a456-426614174000", product_id: "p1", product_name: "P", destination_url: "https://shop.example/p", meta_ad_account_id: "123e4567-e89b-42d3-a456-426614174001", meta_page_id: "page1", dsa_beneficiary: "Approved beneficiary", dsa_payor: "Approved payer", countries: ["FR"], geo_targeting: {}, meta_targeting: {}, advantage_audience: false, min_age: 18, max_age: 65, daily_budget: 10, duration_days: 7, variants: ["angle a", "angle b", "angle c"].map((angle, i) => ({ id: `v${i + 1}`, angle, format: "image", text: "copy", media: ["https://cdn.example/ad.jpg"], call_to_action: "SHOP_NOW" })) };

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
    async createAd({ adsetId, creativeId, variant }) { f.created.ad = (f.created.ad ?? 0) + 1; f.events.push(`ad:${adsetId}:${creativeId}:${variant.angle}`); return `ad-${f.created.ad}`; },
    async activateParent(id) { f.events.push(`activate:${id}`); },
  };
  return f;
}

describe("ad variant packs backend contract", () => {
  it("requires exactly three uniquely named variants with allowed CTA", () => {
    expect(validatePackInput(valid)).toBeNull();
    expect(valid.variants.map((v) => v.call_to_action)).toEqual(["SHOP_NOW", "SHOP_NOW", "SHOP_NOW"]);
    expect(validatePackInput({ ...valid, variants: valid.variants.slice(0, 2) })).toMatch(/trois/);
    expect(validatePackInput({ ...valid, variants: [{ ...valid.variants[0], angle: "Même angle" }, { ...valid.variants[1], angle: " même ANGLE " }, valid.variants[2]] })).toMatch(/angles.*distincts/);
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
  it("sends the full daily budget to one ad set in exact cents", () => {
    expect(packBudgetCents(10)).toBe(1000);
    expect(packBudgetCents(3)).toBe(300);
    expect(() => packBudgetCents(2.99)).toThrow();
  });
  it("creates one paused parent, one full-budget ad set and three named ads before activation", async () => {
    const a = fakeAdapter();
    const result = await launchPack({ pack: valid, pageId: "page1", adapter: a });
    expect(a.events[a.events.indexOf("campaign:PAUSED:sales") - 1]).toContain("save:");
    expect(a.created).toEqual({ campaign: 1, adset: 1, creative: 3, ad: 3 });
    expect(a.campaignParents).toEqual(["campaign-1"]);
    expect(a.events.filter((x) => x.startsWith("adset:"))).toEqual(["adset:1000"]);
    expect(a.events.filter((x) => x.startsWith("ad:"))).toEqual([
      "ad:set-1:creative-1:angle a", "ad:set-1:creative-2:angle b", "ad:set-1:creative-3:angle c",
    ]);
    const lastAdIndex = a.events.reduce((last, event, index) => event.startsWith("ad:") ? index : last, -1);
    expect(a.events.indexOf("activate:campaign-1")).toBeGreaterThan(lastAdIndex);
    expect(a.events.at(-2)).toBe("activate:campaign-1");
    expect(result.activated).toBe(true);
  });
  it("blocks campaign creation on pixel-list error/incompleteness and failed checks", async () => {
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
    expect(timed.created).toEqual({ campaign: 1, adset: 1, creative: 1 });

    const persisted = fakeAdapter(); let saves = 0;
    persisted.save = async (_cp: PackCheckpoint) => { if (++saves === 4) throw new Error("db timeout after ad set effect"); };
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: persisted })).rejects.toThrow(/db timeout/);
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: persisted })).rejects.toThrow(/déjà réclamé/);
    expect(persisted.created).toEqual({ campaign: 1, adset: 1 });
  });
  it("reports progress against the eight creation operations and reports 100 only after persisted activation", () => {
    expect(packProgress({ campaignId: "campaign-1" }, "claimed")).toBe(12);
    expect(packProgress({ campaignId: "campaign-1", adsets: ["set-1"] }, "claimed")).toBe(24);
    expect(packProgress({ campaignId: "campaign-1", adsets: ["set-1"], creatives: ["c1", "c2", "c3"], ads: ["a1", "a2", "a3"] }, "ambiguous")).toBe(99);
    expect(packProgress({ campaignId: "campaign-1", adsets: ["set-1", "set-2", "set-3"], creatives: ["c1", "c2", "c3"], ads: ["a1", "a2", "a3"], activated: true }, "ambiguous")).toBe(99);
    expect(packProgress({ activated: true }, "claimed")).toBeLessThan(100);
    expect(packProgress({ activated: true }, "completed")).toBe(100);
  });
  it("never retries when persisting the activation result fails", async () => {
    const a = fakeAdapter(); let saves = 0;
    a.save = async (_cp: PackCheckpoint, patch) => { if (++saves === 18 && patch?.status === "completed") throw new Error("activation checkpoint timeout"); };
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow(/activation checkpoint/);
    await expect(launchPack({ pack: valid, pageId: "page1", adapter: a })).rejects.toThrow(/déjà réclamé/);
    expect(a.created).toEqual({ campaign: 1, adset: 1, creative: 3, ad: 3 });
    expect(a.events.filter((event) => event.startsWith("activate:"))).toHaveLength(1);
  });
});
