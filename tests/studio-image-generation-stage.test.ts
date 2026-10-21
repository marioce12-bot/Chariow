import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), provider: vi.fn(), store: vi.fn(), signed: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from, rpc: m.rpc }) }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/ai/fal", () => ({ getAiImageModel: () => "mock-model", getAiImageEditModel: () => "mock-edit", generateFalImage: m.provider, generateFalImageWithReferences: m.provider }));
vi.mock("@/lib/studio/media", () => ({ storeStudioImage: m.store, signedStudioUrl: m.signed }));
vi.mock("@/lib/studio/reference-image", () => ({ fetchReferenceImage: vi.fn() }));
vi.mock("@/lib/studio/premium-prompt", () => ({ buildPremiumImagePrompt: ({ prompt }: any) => prompt }));
vi.mock("@/lib/studio/slideshow-image-request", () => ({ validateSlideshowImageRequest: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: any, init?: any) => new Response(JSON.stringify(body), init) } }));
import { generateStudioImage } from "@/lib/studio/image-generation";
const stage = { generationId: "123e4567-e89b-42d3-a456-426614174000", taskId: "task-a", step: 1 };
function insertConflict(row: any, code = "23505") {
  m.from.mockImplementation(() => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code } }) }) }), select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }));
}
beforeEach(() => { vi.clearAllMocks(); m.signed.mockResolvedValue("signed://stored"); });
function updateReply(error: any = null) {
  const response = { data: error ? [] : [{ id: stage.generationId }], error };
  const chain: any = { eq: () => chain, select: async () => response, then: (resolve: any) => resolve(response) };
  return chain;
}
describe("generateStudioImage staged execution", () => {
  it("returns prior completed generation without reservation or provider", async () => {
    insertConflict({ status: "completed", storage_path: "images/a", credits_cost: 7 });
    const response = await generateStudioImage("owner", { prompt: "tree" }, stage);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imageUrl: "signed://stored", generationId: stage.generationId, cost: 7 });
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("returns safe 409 for existing in-progress row", async () => {
    insertConflict({ status: "processing", storage_path: null });
    const response = await generateStudioImage("owner", { prompt: "tree" }, stage);
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "STUDIO_STAGE_UNCERTAIN" });
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("blocks provider when credit reservation is uncertain", async () => {
    m.from.mockImplementation(() => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: stage.generationId }, error: null }) }) }), update: () => updateReply() }));
    m.rpc.mockResolvedValue({ data: null, error: { code: "NETWORK", message: "private" } });
    const response = await generateStudioImage("owner", { prompt: "tree" }, stage);
    expect(response.status).toBe(409); expect(m.provider).not.toHaveBeenCalled();
  });
  it("blocks provider if reserved-credit persistence cannot be confirmed", async () => {
    m.from.mockImplementation(() => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: stage.generationId }, error: null }) }) }), update: () => updateReply({ code: "DB" }) }));
    m.rpc.mockResolvedValue({ data: { ok: true, transaction_id: "tx" }, error: null });
    const response = await generateStudioImage("owner", { prompt: "tree" }, stage);
    expect(response.status).toBe(409); expect(m.provider).not.toHaveBeenCalled();
  });
  it("saves the acquired image before returning uncertain debit state", async () => {
    const writes: any[] = [];
    m.from.mockImplementation(() => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: stage.generationId }, error: null }) }) }), update: (value: any) => { writes.push(value); return updateReply(); } }));
    m.rpc.mockImplementation(async (name: string) => name === "reserve_credits" ? { data: { ok: true, transaction_id: "tx" }, error: null } : { error: { code: "NETWORK" } });
    m.provider.mockResolvedValue("https://provider.test/acquired"); m.store.mockResolvedValue("owner/acquired.png");
    const response = await generateStudioImage("owner", { prompt: "tree" }, stage);
    expect(response.status).toBe(409);
    expect(m.provider).toHaveBeenCalledTimes(1); expect(m.store).toHaveBeenCalledTimes(1);
    expect(writes).toContainEqual({ storage_path: "owner/acquired.png" });
    expect(writes.some(value => value.status === "completed")).toBe(false);
  });

});
