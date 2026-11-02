import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireActiveSubscription: vi.fn(),
  userQuery: {} as any,
  adminFrom: vi.fn(),
  rpc: vi.fn(),
  generateImage: vi.fn(),
  storeImage: vi.fn(),
  signedUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.requireActiveSubscription }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.adminFrom, rpc: mocks.rpc }) }));
vi.mock("@/lib/ai/fal", () => ({
  generateFalImage: mocks.generateImage,
  generateFalImageFromUrl: mocks.generateImage,
  getAiImageEditModel: () => "mock-edit",
}));
vi.mock("@/lib/studio/media", () => ({ storeStudioImage: mocks.storeImage, signedStudioUrl: mocks.signedUrl }));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const generationId = "00000000-0000-4000-8000-000000000011";
const transactionId = "00000000-0000-4000-8000-000000000021";

function request() {
  return new Request("https://preview.example/api/studio/image/edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ generationId, instruction: "rendre le fond bleu" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const userQuery: any = {};
  userQuery.select = vi.fn(() => userQuery);
  userQuery.eq = vi.fn(() => userQuery);
  userQuery.maybeSingle = vi.fn().mockResolvedValue({
    data: { id: generationId, prompt: "photo produit", options: { resolution: "hd", quality: "medium" }, storage_path: null },
    error: null,
  });
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: { from: () => userQuery } });
  mocks.requireActiveSubscription.mockResolvedValue(null);
  mocks.generateImage.mockResolvedValue("https://provider.example/result.png");
  mocks.storeImage.mockResolvedValue("private/result.png");
  mocks.signedUrl.mockResolvedValue("https://signed.example/result.png");

  const creditStatuses = ["pending", "refunded"];
  let creditStatusIndex = 0;
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === "credit_transactions") {
      const query: any = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => ({
        data: { status: creditStatuses[creditStatusIndex++] ?? "refunded", credits: 20, user_id: userId },
        error: null,
      }));
      return query;
    }
    return {
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: "edit-generation" }, error: null }) })) })),
      update: vi.fn(() => {
        const chain: any = {};
        chain.eq = vi.fn(() => chain);
        chain.select = vi.fn().mockResolvedValue({ data: [{ id: "edit-generation" }], error: null });
        return chain;
      }),
    };
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "reserve_image_slot") return { data: { ok: true }, error: null };
    if (name === "reserve_credits") return { data: { ok: true, transaction_id: transactionId }, error: null };
    if (name === "complete_credit_debit") return { data: false, error: null };
    if (name === "refund_credit_debit") return { data: false, error: null };
    return { data: true, error: null };
  });
});

describe("POST /api/studio/image/edit credit compatibility", () => {
  it("accepts the old false refund return when status confirms the transaction is already refunded", async () => {
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_image_slot", "reserve_credits", "complete_credit_debit", "refund_credit_debit", "release_image_slot",
    ]);
    expect(mocks.adminFrom).toHaveBeenCalledWith("credit_transactions");
    expect(mocks.generateImage).toHaveBeenCalledOnce();
  });
});
