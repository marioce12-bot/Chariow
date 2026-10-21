import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
import { POST as prompt } from "@/app/api/studio/prompt/route";
import { POST as generate } from "@/app/api/studio/video/route";
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const product = { name: "Ebook guide", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", image: "https://example.test/cover.png" };
beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: "test" } }); askText.mockResolvedValue('{"direction":"conversation","copyIndices":[0]}'); });
describe("Locked studio video preparation routes", () => {
  it("blocks actual video creation before credit or provider access", async () => {
    const response = await generate(request({ duration: 60 }));
    expect(response.status).toBe(423); expect((await response.json()).code).toBe("STUDIO_VIDEO_LOCKED");
    expect(askText).not.toHaveBeenCalled();
  });
  it("prepares 60s as 4x15s with a constrained text response only", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "characters", duration: 60, product }));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.locked).toBe(true);
    expect(data.plan.segments.map((s: { duration: number }) => s.duration)).toEqual([15,15,15,15]);
    expect(askText.mock.calls[0][0][0].content).toContain("Aucun champ libre");
  });
  it("prepares the slideshow without even calling the text model", async () => {
    const response = await prompt(request({ mediaType: "video", videoMode: "slideshow", duration: 25, product }));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.slideshow.slides).toHaveLength(5); expect(data.locked).toBe(true);
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
  it("falls back safely when text service fails", async () => {
    askText.mockRejectedValue(new Error("offline"));
    expect((await prompt(request({ mediaType: "video", duration: 60, product }))).status).toBe(200);
  });
  it("validates durations, formats and authentication before preparation", async () => {
    expect((await prompt(request({ mediaType: "video", duration: 61, product }))).status).toBe(400);
    expect((await prompt(request({ mediaType: "video", duration: 60, aspectRatio: "21:9", product }))).status).toBe(400);
    requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await generate(request({}))).status).toBe(401);
  });
});
