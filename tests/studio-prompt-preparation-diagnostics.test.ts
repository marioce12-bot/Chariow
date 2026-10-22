import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText: mocks.askText }));

import { POST } from "@/app/api/studio/prompt/route";
import * as slideshowPlan from "@/lib/studio/slideshow-plan";
import { slideshowPublicFailure } from "@/lib/studio/slideshow-errors";

const variationId = "123e4567-e89b-42d3-a456-426614174000";
const product = {
  name: "COLLECTION DE 16 OUVRAGES EN FINANCE ET SCIENCES ÉCONOMIQUES",
  description: "<p>Les chapitres présentent les mécanismes des marchés financiers et leurs instruments.</p><p>Des études de cas expliquent les politiques monétaires et leurs effets sur l'économie.</p><p>Des exercices corrigés accompagnent les calculs budgétaires.</p>",
};
const body = (details = product.description) => ({
  product: { ...product, description: details },
  mediaType: "video",
  videoMode: "slideshow",
  duration: 25,
  aspectRatio: "9:16",
  locale: "fr",
  variationId,
});
const request = (input: unknown) => new Request("https://test.invalid/api/studio/prompt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "test-user" } });
  mocks.askText.mockResolvedValue('{"style":"editorial","composition":"spacious","copyIndices":[]}');
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
const diagnostic = () => JSON.parse(String(warn.mock.calls[0][0]));

describe("prompt route slideshow preparation diagnostics", () => {
  it("builds a sufficiently grounded slideshow from a long title without calling askText", async () => {
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect((await response.json()).slideshow).toBeTruthy();
    expect(mocks.askText).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns insufficient-details response and logs the prompt-plan stage", async () => {
    const response = await POST(request(body("Une collection de livres.")));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PRODUCT_DETAILS" });
    expect(mocks.askText).not.toHaveBeenCalled();
    expect(diagnostic()).toMatchObject({
      event: "studio_preparation_failed",
      taskId: variationId,
      stage: "prompt_plan",
      reason: "INSUFFICIENT_PRODUCT_DETAILS",
      status: 400,
    });
  });

  it("keeps unexpected planner errors private in diagnostics and the public response", async () => {
    const privateFailure = "SENSITIVE_PROVIDER_TOKEN stack trace";
    vi.spyOn(slideshowPlan, "buildSlideshowPlan").mockImplementation(() => { throw new Error(privateFailure); });
    const response = await POST(request(body()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: slideshowPublicFailure("fr") });
    expect(diagnostic()).toMatchObject({
      event: "studio_preparation_failed",
      taskId: variationId,
      stage: "prompt_plan",
      reason: "UNEXPECTED_PREPARATION_ERROR",
      status: 400,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(privateFailure);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("stack trace");
    expect(mocks.askText).not.toHaveBeenCalled();
  });

  it("classifies only the fixed storyboard-similarity message as a safe diagnostic", async () => {
    vi.spyOn(slideshowPlan, "buildSlideshowPlan").mockImplementation(() => {
      throw new Error("Textes trop similaires sur les images 2 et 5. Ajoute des informations produit distinctes avant de générer.");
    });
    const response = await POST(request(body()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: slideshowPublicFailure("fr") });
    expect(diagnostic()).toMatchObject({
      event: "studio_preparation_failed",
      taskId: variationId,
      stage: "prompt_plan",
      reason: "STORYBOARD_TEXT_TOO_SIMILAR",
      status: 400,
    });
    expect(mocks.askText).not.toHaveBeenCalled();
  });
});
