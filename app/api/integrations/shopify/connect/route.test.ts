import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createAdminClient: vi.fn(), resolveUserMaxStores: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/plans", () => ({ resolveUserMaxStores: mocks.resolveUserMaxStores }));
import { GET } from "./route";
import { verifyShopifyState } from "@/lib/shopify/auth";

const storeId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const userId = "fixture-owner";

describe("Shopify OAuth start with shared encryption master", () => {
  let nonceInsert: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SHOPIFY_CLIENT_ID", "fixture-client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "fixture-client-secret-with-sufficient-length");
    vi.stubEnv("SHOPIFY_APP_URL", "https://www.vendeo-studio.site");
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "fixture-shared-master-with-sufficient-length");
    const builder: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: storeId, shop_domain: "fixture-shop.myshopify.com" }, error: null }) };
    mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: { from: vi.fn().mockReturnValue(builder) } });
    nonceInsert = vi.fn().mockResolvedValue({ error: null });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: nonceInsert }) });
    fetchMock = vi.fn(() => { throw new Error("No external request allowed in this test"); });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("creates the exact authorize URL and a signed cookie without contacting Shopify", async () => {
    const response = await GET(new Request(`https://www.vendeo-studio.site/api/integrations/shopify/connect?store_id=${storeId}`));
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.origin).toBe("https://fixture-shop.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("fixture-client-id");
    expect(url.searchParams.get("scope")).toBe("read_products,read_orders");
    expect(url.searchParams.get("redirect_uri")).toBe("https://www.vendeo-studio.site/api/integrations/shopify/callback");
    expect(verifyShopifyState(url.searchParams.get("state")!, userId)?.storeId).toBe(storeId);
    expect(nonceInsert).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing shop before preparing any store or contacting Shopify", async () => {
    const response = await GET(new Request("https://www.vendeo-studio.site/api/integrations/shopify/connect"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Domaine *.myshopify.com requis" });
    expect(nonceInsert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when neither encryption key is configured", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    const response = await GET(new Request("https://www.vendeo-studio.site/api/integrations/shopify/connect"));
    expect(response.status).toBe(503);
    expect(nonceInsert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
