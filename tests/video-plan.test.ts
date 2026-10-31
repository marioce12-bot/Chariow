import { describe, expect, it, vi } from "vitest";
import { buildVideoAdPlan, eligibleVideoDirections, splitVideoDuration, videoModelCapability, videoPlanPrompt, type VideoAdInput } from "@/lib/studio/video-plan";
import { buildVideoProviderPlan } from "@/lib/studio/video-provider-prompts";
import { countFalVideoPromptCharacters, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS } from "@/lib/studio/fal-video-contract";
import { buildSlideshowPlan, prepareSlideshowImages } from "@/lib/studio/slideshow-plan";
const input: VideoAdInput = { name: "Guide ebook cuisine", description: "Un guide numérique de recettes. Disponible en PDF.", hasReference: true, duration: 25, aspectRatio: "9:16", character: "auto" };

describe("Evidence-only video advertising planner", () => {
  it("prepares exactly two clips of 15s then 10s with shared continuity", () => {
    expect(splitVideoDuration(25)).toEqual([15, 10]);
    const plan = buildVideoAdPlan(input, '{"direction":"conversation","copyIndices":[0]}');
    expect(plan.duration).toBe(25);
    expect(plan.segments.map(s => s.duration)).toEqual([15, 10]);
    expect(new Set(plan.segments.map(s => s.prompt)).size).toBe(2);
    for (const segment of plan.segments) expect(segment.prompt).toContain(plan.continuity);
    expect(plan.segments[0].prompt).toContain("HOOK:");
    expect(plan.segments[1].prompt).toContain("CALL TO ACTION:");
    expect(videoPlanPrompt(plan).length).toBeLessThanOrEqual(4000);
  });
  it("keeps long product data and creative direction safely below the Fal limit without repeating full copy", () => {
    const description = Array.from({ length: 30 }, (_, index) => `Le guide est au format PDF. Fait vérifié ${index + 1}: contient un chapitre pratique sur la cuisine.`).join(" ");
    const longInput: VideoAdInput = {
      ...input,
      name: "Guide ebook cuisine",
      description,
      userBrief: "Réalise un motion design moderne et animé avec des transitions fluides. ".repeat(80),
      videoStyle: "motion_design",
    };
    const raw = buildVideoAdPlan(longInput, "", () => 0);
    const plan = buildVideoProviderPlan(longInput, raw, description);
    expect(plan.segments.map(segment => segment.duration)).toEqual([15, 10]);
    for (const segment of plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
      expect(segment.prompt).toContain("Guide ebook cuisine");
      expect(segment.prompt).toContain("Le guide est au format PDF.");
      expect(segment.prompt).toContain("STYLE: Strict 2D motion design");
      expect(segment.prompt).toContain("portrait 9:16");
      expect(segment.prompt).toContain("three distinct on-screen text elements");
      expect(segment.prompt).toContain("visible visual change every 2–3 seconds");
      expect(segment.prompt).toContain("CONTINUITY:");
      expect(segment.prompt).toContain("TIMED ACTION:");
      expect(segment.prompt).not.toMatch(/\b(camera|shot|lens|zoom|dolly|focus)\b/i);
      expect(segment.prompt).not.toContain(description);
      expect(segment.prompt).not.toContain(longInput.userBrief);
    }
    expect(videoPlanPrompt(plan).length).toBeLessThanOrEqual(4000);
    expect(countFalVideoPromptCharacters("é😀")).toBe(2);
  });
  it("varies directions, respects explicit choices and avoids the last direction", () => {
    const first = buildVideoAdPlan(input, '{"direction":"in_hand"}');
    const second = buildVideoAdPlan({ ...input, previousPrompt: videoPlanPrompt(first) }, '{"direction":"in_hand"}', () => 0);
    expect(first.direction).toBe("in_hand"); expect(second.direction).not.toBe("in_hand");
    expect(buildVideoAdPlan({ ...input, userBrief: "un micro trottoir" }).direction).toBe("street_interview");
    expect(buildVideoAdPlan({ ...input, userBrief: "une discussion" }).direction).toBe("conversation");
  });
  it("keeps Motion design and UGC in distinct, explicit direction families", () => {
    const motion = eligibleVideoDirections({ ...input, videoStyle: "motion_design" });
    const ugc = eligibleVideoDirections({ ...input, videoStyle: "ugc" });
    expect(motion).toContain("visual_story");
    expect(motion).toContain("product_film");
    expect(motion).not.toContain("conversation");
    expect(ugc).toContain("conversation");
    expect(ugc).toContain("street_interview");
    expect(ugc).not.toContain("visual_story");
  });
  it("honors no people and never invents physical books or unsupported product claims", () => {
    const plan = buildVideoAdPlan({ ...input, character: "without" }, '{"direction":"in_hand","copyIndices":[0],"dialogue":"Résultat garanti en 3 jours"}', () => 0);
    expect(plan.direction).not.toBe("in_hand");
    for (const segment of plan.segments) {
      expect(segment.prompt).toContain("No people, faces, hands or characters");
      expect(segment.prompt).toContain("not a printed book");
      expect(segment.prompt).not.toContain("Résultat garanti en 3 jours");
    }
    expect(eligibleVideoDirections({ ...input, hasReference: false })).not.toContain("in_hand");
  });
  it("handles missing evidence, malformed answers, hostile fields and strange keys safely", () => {
    for (const answer of ["not JSON", "null", "[]", '{"direction":"__proto__","copyIndices":[-1,999,"0"],"claims":"Invented result"}']) {
      const plan = buildVideoAdPlan({ ...input, description: "", hasReference: false }, answer, () => 0);
      expect(plan.segments[0].prompt).not.toContain("Invented result");
      expect(plan.segments[0].prompt).toContain("No visual reference");
    }
  });
  it("uses verified capabilities only and refuses unsupported durations or provider overrides", () => {
    expect(videoModelCapability("xai/grok-imagine-video/v1.5/image-to-video").maxDuration).toBe(15);
    expect(() => splitVideoDuration(25, "unverified/model")).toThrow("non vérifiées");
    expect(() => splitVideoDuration(42)).toThrow();
    expect(() => buildVideoAdPlan({ ...input, aspectRatio: "21:9" })).toThrow();
    expect(() => buildVideoAdPlan({ ...input, aspectRatio: "16:9" })).toThrow("portrait 9:16");
  });
  it("provides only the required complete 25s narrative", () => {
    const duration = 25;
    const plan = buildVideoAdPlan({ ...input, duration }, '{"direction":"product_film"}');
    expect(plan.segments.reduce((n,s) => n+s.duration,0)).toBe(duration);
    expect(plan.segments.map(s => s.duration)).toEqual([15, 10]);
    expect(plan.segments.at(-1)?.prompt).toContain("portrait 9:16");
  });
});

describe("Slideshow preparation without generation", () => {
  it("prepares exactly 5 faithful images with transitions accounted for in the final 25s", () => {
    const plan = buildSlideshowPlan({ ...input, description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", duration: 25 });
    expect(plan.slides).toHaveLength(5);
    expect(plan.slides.reduce((sum, s) => sum + s.displaySeconds, 0) + 4 * plan.transitionSeconds).toBe(25);
    expect(new Set(plan.slides.map(s => s.prompt )).size).toBe(5);
    expect(plan.slides.every(s => s.prompt.includes("Never invent"))).toBe(true);
  });
  it("generates only via injected stubs with stable keys and stops on image failure", async () => {
    const plan = buildSlideshowPlan({ ...input, description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", duration: 25 });
    const generate = vi.fn().mockResolvedValue({ path: "/synthetic/slide.png" });
    expect(await prepareSlideshowImages(plan, "job", generate)).toHaveLength(5);
    expect(generate.mock.calls[0][0].idempotencyKey).toBe("job:image:0");
    const fail = vi.fn().mockRejectedValue(new Error("stub error"));
    await expect(prepareSlideshowImages(plan, "job", fail)).rejects.toThrow("stub error");
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
