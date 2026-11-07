import { beforeEach, describe, expect, it, vi } from "vitest";
import { ugcFixtureResponse } from "@/tests/fixtures/ugc";
const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
import { POST as prompt } from "@/app/api/studio/prompt/route";
import { POST as generate } from "@/app/api/studio/video/route";
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const product = { name: "Ebook guide", description: "Ce guide présente le jardinage urbain sur balcon. Il explique comment cultiver du basilic et du thym en pots. Une section compare les contenants adaptés aux petits espaces. Un chapitre décrit l’arrosage des plantes aromatiques. Le contenu aborde la récolte des feuilles et leur conservation.", content: "Conseils pour faire pousser des herbes aromatiques dans de petits espaces.", image: "https://cdn.chariow.com/cover.png" };
beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: "test" } }); askText.mockImplementation((messages: Array<{ content: string }>) => Promise.resolve(ugcFixtureResponse(messages))); });
describe("Locked studio video preparation routes", () => {
  it("blocks actual video creation before credit or provider access", async () => {
    const response = await generate(request({ duration: 60 }));
    expect(response.status).toBe(423); expect((await response.json()).code).toBe("STUDIO_VIDEO_LOCKED");
    expect(askText).not.toHaveBeenCalled();
  });
  it("prepares 30s as two 15s clips with a constrained text response only", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "characters", duration: 30, product }));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.locked).toBe(true);
    expect(data.plan.duration).toBe(30);
    expect(data.plan.segments.map((s: { duration: number }) => s.duration)).toEqual([15,15]);
    expect(askText).toHaveBeenCalledTimes(1);
    expect(askText.mock.calls[0][1].order).toEqual(["openrouter"]);
    expect(askText.mock.calls[0][1]).not.toHaveProperty("responseSchema");
    expect(typeof data.prompt).toBe("string");
    expect(data).not.toHaveProperty("analysis");
    expect(data).not.toHaveProperty("creative");
    expect(data).not.toHaveProperty("scenarioFallback");
  });
  it("returns a direct French text prompt for the exact product name", async () => {
    const response = await prompt(request({ mediaType: "video", duration: 30, product, ugcOptions: { characterProfile: "Entrepreneuse de 30 ans" } }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.prompt).toContain(product.name);
    expect(data.prompt).toContain("25–30s");
    expect(data.prompt).toContain("DIALOGUE EXACT: «");
    expect(typeof data.prompt).toBe("string");
    expect(askText).toHaveBeenCalledTimes(1);
    expect(askText.mock.calls[0][1]).not.toHaveProperty("responseSchema");
  });
  it("defaults a missing Studio video duration to 30 seconds", async () => {
    const response = await prompt(request({ mediaType: "video", product }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.plan.duration).toBe(30);
    expect(data.plan.segments.map((segment: { duration: number }) => segment.duration)).toEqual([15, 15]);
  });
  it("prepares the slideshow without even calling the text model", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "slideshow", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.slideshow.slideCount).toBe(5); expect(data.locked).toBe(true);
    expect(data).not.toHaveProperty("prompt");
    expect(data.slideshow).not.toHaveProperty("slides");
    expect(askText).not.toHaveBeenCalled();
  });
  it("requires a real ebook cover before generating its UGC prompt", async () => {
    const response = await prompt(request({ mediaType: "video", duration: 30, product: { name: "Ebook guide", description: "Disponible en PDF." } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "STUDIO_VIDEO_EBOOK_COVER_REQUIRED" });
    expect(askText).not.toHaveBeenCalled();
  });
  it("rejects insufficient and repeated facts with HTTP 400 before any model call", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "slideshow", duration: 25, product: { ...product, description: "Le pack réunit trois guides pratiques. Le pack rassemble 3 ouvrages pratiques." } }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INSUFFICIENT_PRODUCT_DETAILS");
    expect(askText).not.toHaveBeenCalled();
  });
  it.each([5,10,15,20,60])("rejects %ss slideshow before any model call", async duration => {
    expect((await prompt(request({ mediaType: "video", videoMode: "slideshow", duration, product }))).status).toBe(400);
    expect(askText).not.toHaveBeenCalled();
  });
  it("returns a sanitized generation failure without prompt, plan, or fallback", async () => {
    askText.mockRejectedValue(new Error("MODEL_RAW_RESPONSE_MUST_NOT_BE_LOGGED"));
    const response = await prompt(request({ mediaType: "video", duration: 30, product }));
    const data = await response.json();
    expect([502, 504]).toContain(response.status);
    expect(data).toMatchObject({ code: "ugc_prompt_generation_failed", error: "Le scénario n’a pas pu être généré, réessaie.", failureRule: expect.any(String) });
    expect(data).not.toHaveProperty("prompt");
    expect(data).not.toHaveProperty("plan");
    expect(data).not.toHaveProperty("scenarioFallback");
    expect(JSON.stringify(data)).not.toContain("MODEL_RAW_RESPONSE_MUST_NOT_BE_LOGGED");
    expect(askText.mock.calls.length).toBeLessThanOrEqual(3);
  });
  it("explains OpenRouter 429 as a temporary request limit, not an exhausted credit balance", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    askText.mockRejectedValue(Object.assign(new Error("OpenRouter request rejected"), {
      status: 429, retryAfter: "45", providerErrorCode: "rate_limit_exceeded",
      providerErrorMessage: "Rate limit exceeded for model", upstreamProvider: "Example Provider",
    }));
    const response = await prompt(request({ mediaType: "video", duration: 30, product }));
    const data = await response.json();
    expect(response.status).toBe(429);
    expect(data).toMatchObject({
      code: "ugc_prompt_generation_failed",
      failureRule: "provider_rate_limited",
      retryAfterSeconds: 45,
      error: expect.stringContaining("limite temporairement les requêtes"),
    });
    expect(data.error).not.toContain("crédits");
    expect(log).toHaveBeenCalledWith("Studio UGC preparation failed", expect.objectContaining({
      upstreamCode: "rate_limit_exceeded", upstreamMessage: "Rate limit exceeded for model",
      upstreamProvider: "Example Provider", retryAfter: "45",
    }));
    expect(askText).toHaveBeenCalledOnce();
    log.mockRestore();
  });
  it("returns missing product fields before calling any model", async () => {
    const response = await prompt(request({
      mediaType: "video", duration: 30,
      product: { name: "Produit", description: "", category: "", type: "", tags: [] },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "infos_produit_manquantes",
      missingFields: ["product.description", "product.content"],
    });
    expect(askText).not.toHaveBeenCalled();
  });
  it("validates durations, formats and authentication before preparation", async () => {
    expect((await prompt(request({ mediaType: "video", duration: 61, product }))).status).toBe(400);
    expect((await prompt(request({ mediaType: "video", duration: 30, aspectRatio: "21:9", product }))).status).toBe(400);
    requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await generate(request({}))).status).toBe(401);
  });
});
