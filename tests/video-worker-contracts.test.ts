import { describe, expect, it, vi } from "vitest";
import { buildSlideshowPlan, runPreparedSlideshow } from "@/lib/studio/slideshow-plan";
import { runVideoPipeline } from "@/lib/studio/video-pipeline";
const input = { name: "Ebook", description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", hasReference: true, duration: 25, aspectRatio: "9:16", character: "auto" as const };
describe("Prepared worker contracts", () => {
  it("passes the selected licensed music into slideshow assembly and preserves attribution", async () => {
    const plan = buildSlideshowPlan(input, "123");
    const generateImage = vi.fn(async () => ({ path: "/local/slide.png" }));
    const resolveLicensedMusic = vi.fn(async () => ({ path: "/local/music.ogg", commercialUseAllowed: true, attribution: "Test — CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Test.ogg" }));
    const assemble = vi.fn(async () => "/final.mp4");
    const result = await runPreparedSlideshow(plan, "job", { generateImage, resolveLicensedMusic, assemble });
    expect(resolveLicensedMusic).toHaveBeenCalledWith("123");
    expect(assemble).toHaveBeenCalledWith(expect.objectContaining({ musicPath: "/local/music.ogg", duration: 25, transitionDuration: 0.8 }));
    expect(result.attribution).toBe("Test — CC0");
  });
  it("rejects unvalidated music rights before any images are generated", async () => {
    const generateImage = vi.fn(); const assemble = vi.fn();
    await expect(runPreparedSlideshow(buildSlideshowPlan(input, "123"), "job", { generateImage, assemble, resolveLicensedMusic: async () => ({ path: "/music", commercialUseAllowed: false, attribution: "", sourceUrl: "" }) })).rejects.toThrow("Licence");
    expect(generateImage).not.toHaveBeenCalled(); expect(assemble).not.toHaveBeenCalled();
  });
  it("passes an initial reference and refuses a missing continuation frame", async () => {
    const generateSegment = vi.fn(async ({ segment }: { segment: { index: number } }) => ({ url: "/clip.mp4", duration: 15, index: segment.index }));
    const assemble = vi.fn();
    await expect(runVideoPipeline("job", { duration: 30, aspectRatio: "9:16", direction: "in_hand", continuity: "same actor", segments: [0,1].map(index => ({ index, duration: 15, prompt: "scene" })) }, { generateSegment, assemble, extractLastFrame: async () => "" }, "https://example.test/cover.png")).rejects.toThrow("Continuity frame");
    expect(generateSegment.mock.calls[0][0]).toMatchObject({ referenceUrl: "https://example.test/cover.png" });
    expect(generateSegment).toHaveBeenCalledTimes(1); expect(assemble).not.toHaveBeenCalled();
  });
});
