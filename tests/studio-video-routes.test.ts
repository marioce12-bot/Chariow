import { beforeEach, describe, expect, it, vi } from "vitest";
import { ugcFixtureResponse } from "@/tests/fixtures/ugc";
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
    expect(askText.mock.calls[0][1]).toEqual({ order: ["groq"] });
    expect(askText.mock.calls[1][1]).toEqual({ order: ["groq"] });
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
  it("fails closed when text service fails instead of returning a generic fallback", async () => {
    askText.mockRejectedValue(new Error("offline"));
    const response = await prompt(request({ mediaType: "video", duration: 25, product }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "STUDIO_UGC_PREPARATION_FAILED" });
  });
  it("validates durations, formats and authentication before preparation", async () => {
    expect((await prompt(request({ mediaType: "video", duration: 61, product }))).status).toBe(400);
    expect((await prompt(request({ mediaType: "video", duration: 25, aspectRatio: "21:9", product }))).status).toBe(400);
    requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await generate(request({}))).status).toBe(401);
  });
});
