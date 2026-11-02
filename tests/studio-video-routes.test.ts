import { beforeEach, describe, expect, it, vi } from "vitest";
import { ugcAnalysis, ugcCreative, ugcFixtureResponse } from "@/tests/fixtures/ugc";
const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
import { POST as prompt } from "@/app/api/studio/prompt/route";
import { POST as generate } from "@/app/api/studio/video/route";
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const product = { name: "Ebook guide", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", image: "https://cdn.chariow.com/cover.png" };
beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: "test" } }); askText.mockImplementation((messages: Array<{ content: string }>) => Promise.resolve(ugcFixtureResponse(messages))); });
describe("Locked studio video preparation routes", () => {
  it("blocks actual video creation before credit or provider access", async () => {
    const response = await generate(request({ duration: 60 }));
    expect(response.status).toBe(423); expect((await response.json()).code).toBe("STUDIO_VIDEO_LOCKED");
    expect(askText).not.toHaveBeenCalled();
  });
  it("prepares 25s as 15s+10s with a constrained text response only", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "characters", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.locked).toBe(true);
    expect(data.plan.segments.map((s: { duration: number }) => s.duration)).toEqual([15,10]);
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[0][1].order).toEqual(["groq"]);
    expect(askText.mock.calls[1][1].order).toEqual(["groq"]);
    expect(askText.mock.calls[0][1].responseSchema.name).toBe("ugc_product_analysis");
    expect(askText.mock.calls[1][1].responseSchema.name).toBe("ugc_creative_direction");
  });
  it("lets the AI choose the cast instead of accepting a user profile", async () => {
    const response = await prompt(request({ mediaType: "video", duration: 25, product, ugcOptions: { characterProfile: "Entrepreneuse de 30 ans" } }));
    expect(response.status).toBe(200);
    expect(askText).toHaveBeenCalledTimes(2);
    const creativeMessages = askText.mock.calls[1][0] as Array<{ role: string; content: string }>;
    const modelPayload = JSON.parse(creativeMessages[1].content);
    expect(modelPayload.options).not.toHaveProperty("characterProfile");
    expect(creativeMessages[0].content).toContain("Choisis toi-même un ou deux adultes fictifs noirs ou métissés");
  });
  it("accepts an explicit Afro-descendant look through the complete UGC route", async () => {
    const creative = ugcCreative(product.name);
    creative.characters[0].look = "Afro-descendante, peau brune et cheveux naturels";
    askText.mockResolvedValueOnce(JSON.stringify(ugcAnalysis(product.name))).mockResolvedValueOnce(JSON.stringify(creative));
    const response = await prompt(request({ mediaType: "video", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.creative.characters[0].look).toBe(creative.characters[0].look);
    expect(askText).toHaveBeenCalledTimes(2);
  });
  it("returns a redacted look-specific diagnostic when only gender carries the casting label", async () => {
    const privateModelText = "MODEL_RAW_RESPONSE_MUST_NOT_BE_LOGGED";
    const creative = ugcCreative(product.name);
    creative.characters[0].look = `${privateModelText}: peau foncée, cheveux naturels`;
    creative.characters[0].gender = "Black woman";
    askText.mockResolvedValueOnce(JSON.stringify(ugcAnalysis(product.name))).mockResolvedValueOnce(JSON.stringify(creative));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await prompt(request({ mediaType: "video", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(422);
    expect(data).toMatchObject({
      code: "analyse_invalide",
      keyPath: "characters[0].look",
      validationType: "invalid_value",
      expected: "marqueur explicite positif dans look: noir/noire, métis/métisse, Black, mixed-race, biracial ou afro-descendant",
      received: "marqueur explicite absent de look",
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(privateModelText);
    expect(JSON.stringify(data)).not.toContain(privateModelText);
    expect(askText).toHaveBeenCalledTimes(2);
    diagnostic.mockRestore();
  });
  it("ignores the legacy Motion Design preference and keeps prompt planning in UGC", async () => {
    const response = await prompt(request({ mediaType: "video", videoStyle: "motion_design", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.locked).toBe(true);
    expect(data.plan.segments[0].prompt).toContain("Black or mixed-race");
    expect(askText).toHaveBeenCalledTimes(2);
    expect(data.prompt).toContain(product.name);
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
    const response = await prompt(request({ mediaType: "video", duration: 25, product: { name: "Ebook guide", description: "Disponible en PDF." } }));
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
  it("returns a distinct model error and HTTP status without leaking provider text", async () => {
    askText.mockRejectedValue(new Error("offline"));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await prompt(request({ mediaType: "video", duration: 25, product }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "erreur_modele", httpStatus: null });
    expect(diagnostic).toHaveBeenCalledWith("Studio UGC preparation failed", {
      stage: "product_analysis_provider",
      type: "provider_error", keyPath: null, httpStatus: null,
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("offline");
    diagnostic.mockRestore();
  });
  it("returns the failing analysis key and type for a known invalid mocked model response", async () => {
    const privateModelText = "MODEL_RAW_RESPONSE_MUST_NOT_BE_LOGGED";
    askText.mockResolvedValueOnce(JSON.stringify({
      ...ugcAnalysis(product.name), price_positioning: [], assumptions: [privateModelText],
    }));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await prompt(request({ mediaType: "video", duration: 25, product }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "analyse_invalide", keyPath: "price_positioning", validationType: "type_mismatch",
      expected: "string", received: "array",
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(privateModelText);
    expect(askText).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });
  it("returns missing product fields before calling any model", async () => {
    const response = await prompt(request({
      mediaType: "video", duration: 25,
      product: { name: "Produit", description: "", category: "", type: "", tags: [] },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "infos_produit_manquantes",
      missingFields: ["product.description", "product.category", "product.type", "product.tags"],
    });
    expect(askText).not.toHaveBeenCalled();
  });
  it("validates durations, formats and authentication before preparation", async () => {
    expect((await prompt(request({ mediaType: "video", duration: 61, product }))).status).toBe(400);
    expect((await prompt(request({ mediaType: "video", duration: 25, aspectRatio: "21:9", product }))).status).toBe(400);
    requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await generate(request({}))).status).toBe(401);
  });
});
