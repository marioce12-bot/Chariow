import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPackMetaOperations } from "./ad-variant-pack-meta";

vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "token") }));
vi.mock("@/lib/meta/graph", () => ({ fetchMetaGraph: (input: any, init?: any) => (globalThis.fetch as any)(input, init), createMetaGraphError: (_e: unknown, status: number, fallback: string) => new Error(fallback + ` (${status})`) }));
const supabase = (account: any = { id: "db", meta_account_id: "123", access_token_encrypted: "cipher", is_active: true }, preferences: any[] = [{ pixel_id: "pixel-1" }]) => ({
  from: (table: string) => table === "meta_pixels" ? { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: preferences, error: null }) }) }) }) }) }) } : ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: account, error: null }) }) }) }) }),
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array([0xff,0xd8,0xff])]), error: null }) }) },
});
const basePack: any = { client_request_id: "r", store_id: "s", product_id: "p", product_name: "Item", destination_url: "https://shop.example", meta_ad_account_id: "db", meta_page_id: "456", dsa_beneficiary: "Approved beneficiary", dsa_payor: "Approved payer", countries: ["US"], geo_targeting: null, meta_targeting: {}, advantage_audience: false, min_age: 18, max_age: 45, daily_budget: 3, duration_days: 5, variants: [{ id: "v", angle: "Angle", format: "image", text: "Copy", media: ["https://supabase.example/storage/v1/object/sign/studio-media/user-1/a.jpg?token=x"], call_to_action: "SHOP_NOW" }] };
const ok = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function setupFetch(opts: { pixels?: any[]; next?: string; account?: any; postError?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any = {}) => {
    const url = String(input), method = init.method ?? "GET"; calls.push({ url, method, body: String(init.body ?? "") });
    if (method === "POST") return opts.postError ? new Response("timeout", { status: 504 }) : url.includes("adimages") ? ok({ images: { creative: { hash: "img-hash" } } }) : url.endsWith("/created-id") ? ok({ success: true }) : ok({ id: "created-id" });
    if (url.includes("adspixels")) return ok({ data: opts.pixels ?? [], ...(opts.next ? { paging: { next: opts.next } } : {}) });
    if (url.includes("next-pixels")) return ok({ data: [{ id: "pixel-2" }] });
    if (url.includes("me/accounts")) return ok({ data: [{ id: "456", access_token: "page-token" }] });
    return ok(opts.account ?? { id: "123", currency: "USD", account_status: 1, business_name: "Verified advertiser" });
  }));
  return calls;
}
beforeEach(() => { vi.unstubAllGlobals(); process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example"; });

describe("createPackMetaOperations", () => {
  it("fails closed on non-USD and creates no effect", async () => {
    const calls = setupFetch({ account: { id: "123", currency: "EUR", account_status: 1 } });
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack });
    await expect(ops.verify()).rejects.toThrow(/USD/); expect(calls.some(c => c.method === "POST")).toBe(false);
  });
  it("reads pixel pages exhaustively and classifies the account as sales", async () => {
    const calls = setupFetch({ pixels: [{ id: "pixel-1" }], next: "https://graph.facebook.com/v23.0/next-pixels" });
    const result = await createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack }).verify();
    expect(result).toMatchObject({ pixelCheck: "present", pixelId: "pixel-1", exhaustivePixelList: true });
    expect(calls.some(c => c.url.includes("next-pixels"))).toBe(true);
    expect(calls.find(c => c.url.includes("act_123"))?.url).toContain("business_name%2Cname");
  });
  it("selects the configured pixel among verified Meta pixels rather than the first returned", async () => {
    setupFetch({ pixels: [{ id: "pixel-1" }, { id: "pixel-2" }] });
    const result = await createPackMetaOperations({ supabase: supabase(undefined, [{ pixel_id: "pixel-2" }]), userId: "user-1", pack: basePack }).verify();
    expect(result).toMatchObject({ pixelCheck: "present", pixelId: "pixel-2" });
  });
  it("blocks before any Meta creation if multiple pixels have no verified preference", async () => {
    const calls = setupFetch({ pixels: [{ id: "pixel-1" }, { id: "pixel-2" }] });
    await expect(createPackMetaOperations({ supabase: supabase(undefined, []), userId: "user-1", pack: basePack }).verify()).rejects.toThrow(/Plusieurs pixels/);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("rejects malicious pagination origins", async () => {
    const calls = setupFetch({ next: "https://127.0.0.1/admin" });
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack });
    await expect(ops.verify()).rejects.toThrow(/pagination Meta non autorisée/);
    expect(calls.some(c => c.url.includes("127.0.0.1"))).toBe(false);
  });
  it("blocks media ownership mismatch before effects", async () => {
    const calls = setupFetch(); const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-2", pack: basePack });
    await expect(ops.verify()).rejects.toThrow(/non autorisé/); expect(calls.some(c => c.method === "POST")).toBe(false);
  });
  it("does not retry a timed-out POST", async () => {
    const calls = setupFetch({ postError: true }); const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack });
    await ops.verify(); await expect(ops.createCampaign({ objective: "traffic", status: "PAUSED" })).rejects.toThrow();
    expect(calls.filter(c => c.method === "POST")).toHaveLength(1);
  });
  it("uses exact cents, WEBSITE, active ad set and exact CTA", async () => {
    const calls = setupFetch(); const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack });
    await ops.verify(); const campaign = await ops.createCampaign({ objective: "traffic", status: "PAUSED" });
    await ops.createAdSet({ campaignId: campaign, budgetCents: 321 });
    const creative = await ops.createCreative({ variant: basePack.variants[0], pageId: "456" }); await ops.createAd({ adsetId: "set", creativeId: creative, variant: basePack.variants[0] });
    const adset = new URLSearchParams(calls.find(c => c.url.includes("/adsets") && c.method === "POST")!.body);
    expect(adset.get("name")).toBe("Pack — Item (3 publicités)"); expect(adset.get("daily_budget")).toBe("321"); expect(adset.get("destination_type")).toBe("WEBSITE"); expect(adset.get("status")).toBe("ACTIVE");
    expect(adset.get("dsa_beneficiary")).toBe("Approved beneficiary"); expect(adset.get("dsa_payor")).toBe("Approved payer");
    const spec = JSON.parse(new URLSearchParams(calls.find(c => c.url.includes("/adcreatives") && c.method === "POST")!.body).get("object_story_spec")!);
    expect(spec.link_data.call_to_action.type).toBe("SHOP_NOW"); expect(spec.link_data.image_hash).toBe("img-hash");
    const ad = new URLSearchParams(calls.find(c => c.url.endsWith("/ads") && c.method === "POST")!.body);
    expect(ad.get("name")).toBe("Angle"); expect(ad.get("adset_id")).toBe("set");
  });
  it("preserves a city-only audience, gender and Meta catalog interest", async () => {
    const calls = setupFetch();
    const pack = { ...basePack, countries: ["BJ"], geo_targeting: { countries: [], regions: [], cities: [{ key: "1234", name: "Cotonou", radius: 25, distance_unit: "mile" }] }, meta_targeting: { gender: "female", interests: [{ id: "123456", name: "Beauté" }] } };
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack });
    await ops.verify();
    const campaignId = await ops.createCampaign({ objective: "traffic", status: "PAUSED" });
    await ops.createAdSet({ campaignId, budgetCents: 100 });
    const params = new URLSearchParams(calls.find(c => c.url.includes("/adsets") && c.method === "POST")!.body);
    const targeting = JSON.parse(params.get("targeting")!);
    expect(targeting.geo_locations).toEqual({ cities: [{ key: "1234", radius: 25, distance_unit: "mile" }] });
    expect(targeting.genders).toEqual([2]);
    expect(targeting.flexible_spec[0].interests).toEqual([{ id: "123456", name: "Beauté" }]);
  });
  it("blocks malformed interests before any Meta POST rather than dropping them", async () => {
    const calls = setupFetch();
    const pack = { ...basePack, meta_targeting: { gender: "female", interests: [{ id: "invented", name: "Intérêt inconnu" }] } };
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack });
    await expect(ops.verify()).rejects.toThrow(/intérêt Meta invalide/);
    expect(calls.some(c => c.method === "POST")).toBe(false);
  });
  it("accepts success:true for parent activation", async () => {
    setupFetch(); const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack }); await ops.verify();
    const campaign = await ops.createCampaign({ objective: "traffic", status: "PAUSED" }); await expect(ops.activateParent(campaign)).resolves.toBeUndefined();
  });
  it("does not accept an id without explicit success as activation confirmation", async () => {
    setupFetch(); const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack: basePack }); await ops.verify();
    const campaign = await ops.createCampaign({ objective: "traffic", status: "PAUSED" });
    vi.stubGlobal("fetch", vi.fn(async () => ok({ id: campaign })));
    await expect(ops.activateParent(campaign)).rejects.toThrow();
  });
  it("creates a single carousel creative after uploading each card once", async () => {
    const calls = setupFetch(); const pack = { ...basePack, variants: [{ ...basePack.variants[0], format: "carousel", media: [basePack.variants[0].media[0], "https://supabase.example/storage/v1/object/sign/studio-media/user-1/b.jpg?token=x"] }] };
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack }); await ops.verify();
    await ops.createCreative({ variant: pack.variants[0], pageId: "456" });
    expect(calls.filter(c => c.method === "POST" && c.url.includes("/adimages"))).toHaveLength(2);
    const creatives = calls.filter(c => c.method === "POST" && c.url.includes("/adcreatives")); expect(creatives).toHaveLength(1);
    const spec = JSON.parse(new URLSearchParams(creatives[0].body).get("object_story_spec")!);
    expect(spec.link_data.child_attachments).toHaveLength(2); expect(spec.link_data.child_attachments[0].call_to_action.type).toBe("SHOP_NOW");
  });
  it("verifies an owned public video without POST and sends it once with the exact CTA", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "testcloud");
    const videoUrl = "https://res.cloudinary.com/testcloud/video/upload/v123/vendeo/campaign-creatives/clip.mp4";
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const filters: Array<{ table: string; key: string; value: unknown }> = [];
    const client = { from(table: string) {
      const q: any = { select: () => q, eq: (key: string, value: unknown) => { filters.push({ table, key, value }); return q; }, maybeSingle: async () => ({ data: table === "meta_ad_accounts" ? { id: "db", meta_account_id: "123", access_token_encrypted: "cipher", is_active: true } : table === "creative_media_asset_urls" ? { url: videoUrl, asset_id: "asset-1" } : { kind: "video", file_size: 1024 }, error: null }) };
      return q;
    } };
    vi.stubGlobal("fetch", vi.fn(async (input: any, init: any = {}) => {
      const url = String(input), method = init.method ?? "GET";
      calls.push({ url, method, body: String(init.body ?? "") });
      if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-type": "video/mp4", "content-length": "1024" } });
      if (method === "POST" && url.includes("/advideos")) return ok({ id: "video-1" });
      if (method === "POST" && url.includes("/adcreatives")) return ok({ id: "creative-1" });
      if (method === "POST") return ok({ id: "campaign-1" });
      if (url.includes("/video-1")) return ok({ status: { video_status: "ready" }, picture: "https://example.com/thumbnail.jpg" });
      if (url.includes("adspixels")) return ok({ data: [] });
      if (url.includes("me/accounts")) return ok({ data: [{ id: "456", access_token: "page-token" }] });
      return ok({ id: "123", currency: "USD", account_status: 1, business_name: "Verified advertiser" });
    }));
    try {
      const variant = { ...basePack.variants[0], format: "video", media: [videoUrl], call_to_action: "SHOP_NOW" };
      const ops = createPackMetaOperations({ supabase: client, userId: "user-1", pack: { ...basePack, variants: [variant] } });
      await ops.verify();
      expect(calls.some(c => c.method === "POST")).toBe(false);
      expect(filters).toContainEqual({ table: "creative_media_asset_urls", key: "user_id", value: "user-1" });
      expect(filters).toContainEqual({ table: "creative_media_assets", key: "user_id", value: "user-1" });
      await ops.createCampaign({ objective: "traffic", status: "PAUSED" });
      expect(await ops.createCreative({ variant, pageId: "456" })).toBe("creative-1");
      const uploads = calls.filter(c => c.method === "POST" && c.url.includes("/advideos"));
      expect(uploads).toHaveLength(1);
      expect(new URLSearchParams(uploads[0].body).get("file_url")).toBe(videoUrl);
      const creatives = calls.filter(c => c.method === "POST" && c.url.includes("/adcreatives"));
      expect(creatives).toHaveLength(1);
      const story = JSON.parse(new URLSearchParams(creatives[0].body).get("object_story_spec")!);
      expect(story.video_data.call_to_action.type).toBe("SHOP_NOW");
      expect(story.video_data.video_id).toBe("video-1");
    } finally { vi.unstubAllEnvs(); }
  });
  it("refuses private studio video before parent creation", async () => {
    const calls = setupFetch(); const pack = { ...basePack, variants: [{ ...basePack.variants[0], format: "video" }] };
    const ops = createPackMetaOperations({ supabase: supabase(), userId: "user-1", pack });
    await expect(ops.verify()).rejects.toThrow(/studio-media privée/); expect(calls.some(c => c.method === "POST")).toBe(false);
  });
});
