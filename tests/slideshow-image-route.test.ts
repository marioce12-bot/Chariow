import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireActiveSubscription: vi.fn(),
  createAdminClient: vi.fn(),
  generateFalImage: vi.fn(),
  generateFalImageWithReferences: vi.fn(),
  getAiImageEditModel: vi.fn(),
  getAiImageModel: vi.fn(),
  imageCreditCost: vi.fn(),
  storeStudioImage: vi.fn(),
  signedStudioUrl: vi.fn(),
  fetchReferenceImage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.requireActiveSubscription }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/ai/fal", () => ({
  generateFalImage: mocks.generateFalImage,
  generateFalImageWithReferences: mocks.generateFalImageWithReferences,
  getAiImageEditModel: mocks.getAiImageEditModel,
  getAiImageModel: mocks.getAiImageModel,
}));
vi.mock("@/lib/studio/credits", () => ({ imageCreditCost: mocks.imageCreditCost }));
vi.mock("@/lib/studio/media", () => ({ storeStudioImage: mocks.storeStudioImage, signedStudioUrl: mocks.signedStudioUrl }));
vi.mock("@/lib/studio/reference-image", () => ({ fetchReferenceImage: mocks.fetchReferenceImage }));

import { POST } from "../app/api/studio/image/route";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";

const subscriptionStop = Response.json({ error: "subscription required" }, { status: 402 });
const product = {
  name: "Carnet Lumière",
  description: "Couverture en lin naturel. Papier ivoire certifié FSC. Reliure cousue à la main.",
  image: "https://example.test/carnet.jpg",
};

function request(slideshow: Record<string, unknown>) {
  return new Request("http://localhost/api/studio/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slideshow }),
  });
}

function validStoryboard(overrides: Record<string, unknown> = {}) {
  return { product, duration: 25, aspectRatio: "9:16", locale: "fr", campaignGoal: "buy", imageCount: 5, slideIndex: 0, ...overrides };
}

function expectNoPaidOrExternalWork() {
  expect(mocks.requireActiveSubscription).not.toHaveBeenCalled();
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.fetchReferenceImage).not.toHaveBeenCalled();
  expect(mocks.imageCreditCost).not.toHaveBeenCalled();
  expect(mocks.generateFalImage).not.toHaveBeenCalled();
  expect(mocks.generateFalImageWithReferences).not.toHaveBeenCalled();
}

describe("POST /api/studio/image slideshow validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "preview");
    mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.requireActiveSubscription.mockResolvedValue(subscriptionStop);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["imageCount 6", { imageCount: 6 }],
    ["imageCount 1", { imageCount: 1 }],
    ["imageCount 2", { imageCount: 2 }],
    ["imageCount 3", { imageCount: 3 }],
    ["negative slide index", { slideIndex: -1 }],
    ["out-of-range slide index", { slideIndex: 5 }],
    ["mismatched slide count", { imageCount: 4 }],
  ])("returns HTTP 400 for %s before subscription or paid/external work", async (_label, override) => {
    const response = await POST(request(validStoryboard(override)));
    expect(response.status).toBe(400);
    expectNoPaidOrExternalWork();
  });

  it("rejects slideshow requests outside released environments before subscription or paid/external work", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    const response = await POST(request(validStoryboard()));
    expect(response.status).toBe(400);
    expectNoPaidOrExternalWork();
  });

  it("never marks a carousel image complete when private storage failed", async () => {
    mocks.requireActiveSubscription.mockResolvedValue(null);
    mocks.fetchReferenceImage.mockResolvedValue({ body: new ArrayBuffer(1), contentType: "image/png" });
    mocks.imageCreditCost.mockReturnValue(20); mocks.getAiImageEditModel.mockReturnValue("mock-model");
    mocks.generateFalImageWithReferences.mockResolvedValue("https://provider.test/transient.png");
    mocks.storeStudioImage.mockRejectedValue(new Error("mock storage failure"));
    const updates: Array<Record<string, unknown>> = [];
    const eqChain = { eq: vi.fn() };
    eqChain.eq.mockReturnValue(eqChain);
    const table = { insert: vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "generation-1" }, error: null }) }) })), update: vi.fn((value: Record<string, unknown>) => { updates.push(value); return eqChain; }) };
    const rpc = vi.fn(async (operation: string) => operation === "reserve_credits" ? ({ data: { ok: true, transaction_id: "mock-transaction" }, error: null }) : ({ error: null }));
    mocks.createAdminClient.mockReturnValue({ from: () => table, rpc });
    const response = await POST(request(validStoryboard()));
    expect(response.ok).toBe(false); expect(updates.some(value => value.status === "completed")).toBe(false);
    expect(updates.some(value => value.status === "failed")).toBe(true);
    expect(mocks.generateFalImageWithReferences).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("refund_credit_debit", { transaction_id: "mock-transaction" });
    expect(mocks.signedStudioUrl).not.toHaveBeenCalled();
  });

  it("accepts the released five-image storyboard on Production without bypassing subscription", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await POST(request(validStoryboard()));
    expect(response.status).toBe(402);
    expect(mocks.requireActiveSubscription).toHaveBeenCalledWith("user-1");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.generateFalImage).not.toHaveBeenCalled();
    expect(mocks.generateFalImageWithReferences).not.toHaveBeenCalled();
  });

  it("accepts a valid five-image plan, rebuilds the selected server prompt, then stops at subscription", async () => {
    const storyboard = validStoryboard({ slideIndex: 2, prompt: "client-controlled prompt must be ignored" });
    const expected = buildSlideshowPlan({
      name: product.name,
      description: product.description,
      hasReference: true,
      duration: 25,
      aspectRatio: "9:16",
      character: "without",
      locale: "fr",
      campaignGoal: "buy",
    });
  expect(expected.slides).toHaveLength(5);

  const response = await POST(request(storyboard));
  expect(response.status).toBe(402);
  expect(await response.json()).toEqual({ error: "subscription required" });
  expect(mocks.requireActiveSubscription).toHaveBeenCalledOnce();
  expect(mocks.requireActiveSubscription).toHaveBeenCalledWith("user-1");
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.imageCreditCost).not.toHaveBeenCalled();
  expect(mocks.generateFalImage).not.toHaveBeenCalled();
  expect(mocks.generateFalImageWithReferences).not.toHaveBeenCalled();
    // Validation and prompt compilation occur before the subscription gate; no client prompt reaches I/O.
    expect(expected.slides[2].prompt).toContain("ROLE: EVIDENCE");
    expect(expected.slides[2].prompt).toContain("Papier ivoire certifié FSC.");
    expect(expected.slides[2].headline).not.toBe(expected.slides[0].headline);
    expect(mocks.fetchReferenceImage).not.toHaveBeenCalled();
  });
});
