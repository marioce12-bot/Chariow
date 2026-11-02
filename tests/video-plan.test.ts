import { describe, expect, it, vi } from "vitest";
import { buildVideoAdPlan, eligibleVideoDirections, splitVideoDuration, videoModelCapability, videoPlanPrompt, type VideoAdInput } from "@/lib/studio/video-plan";
import { buildVideoProviderPlan } from "@/lib/studio/video-provider-prompts";
import { countFalVideoPromptCharacters, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS } from "@/lib/studio/fal-video-contract";
import { buildSlideshowPlan, prepareSlideshowImages } from "@/lib/studio/slideshow-plan";

const input: VideoAdInput = { name: "Guide ebook cuisine", description: "Un guide numérique de recettes. Disponible en PDF.", hasReference: true, duration: 25, aspectRatio: "9:16", character: "with" };

describe("Evidence-only UGC video advertising planner", () => {
  it.each([10, 15])("creates a single %ss fal.ai clip without continuity stitching", duration => {
    expect(splitVideoDuration(duration)).toEqual([duration]);
    const plan = buildVideoAdPlan({ ...input, duration }, '{"direction":"conversation","copyIndices":[0]}');
    expect(plan.duration).toBe(duration);
    expect(plan.segments.map(segment => segment.duration)).toEqual([duration]);
    expect(plan.segments[0].prompt).toContain(`exactly ${duration}s`);
    expect(plan.segments[0].prompt).toContain("CALL TO ACTION");
  });

  it("prepares exactly two clips of 15s then 10s and keeps the product and cast visible", () => {
    expect(splitVideoDuration(25)).toEqual([15, 10]);
    const plan = buildVideoAdPlan(input, '{"direction":"conversation","copyIndices":[0]}');
    expect(plan.duration).toBe(25);
    expect(plan.segments.map(s => s.duration)).toEqual([15, 10]);
    expect(new Set(plan.segments.map(s => s.prompt)).size).toBe(2);
    for (const segment of plan.segments) {
      expect(segment.prompt).toContain(plan.continuity);
      expect(segment.prompt).toContain("Black or mixed-race");
      expect(segment.prompt).toContain("The product itself or its supplied reference must be clearly visible");
    }
    expect(plan.segments[0].prompt).toContain("HOOK");
    expect(plan.segments[1].prompt).toContain("CALL TO ACTION");
    expect(videoPlanPrompt(plan).length).toBeLessThanOrEqual(4000);
  });

  it("keeps long product data and creative direction below the Fal limit and forces UGC", () => {
    const description = Array.from({ length: 30 }, (_, index) => `Le guide est au format PDF. Fait vérifié ${index + 1}: contient un chapitre pratique sur la cuisine.`).join(" ");
    const longInput: VideoAdInput = {
      ...input,
      name: "Guide ebook cuisine",
      description,
      userBrief: "Motion design moderne avec graphismes animés, sans personnages. ".repeat(80),
    };
    const plan = buildVideoProviderPlan(longInput, buildVideoAdPlan(longInput, "", () => 0), description);
    expect(plan.segments.map(segment => segment.duration)).toEqual([15, 10]);
    for (const segment of plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
      expect(segment.prompt).toContain("Guide ebook cuisine");
      expect(segment.prompt).toContain("Le guide est au format PDF.");
      expect(segment.prompt).toContain("STYLE: Staged UGC");
      expect(segment.prompt).toContain("Black or mixed-race");
      expect(segment.prompt).toContain("portrait 9:16");
      expect(segment.prompt).toContain("three distinct on-screen text elements");
      expect(segment.prompt).toContain("CONTINUITY:");
      expect(segment.prompt).toContain("TIMED ACTION:");
      expect(segment.prompt).not.toMatch(/motion design|graphismes animés|sans personnages/i);
      expect(segment.prompt).not.toContain(description);
      expect(segment.prompt).not.toContain(longInput.userBrief);
    }
    expect(videoPlanPrompt(plan).length).toBeLessThanOrEqual(4000);
    expect(countFalVideoPromptCharacters("é😀")).toBe(2);
  });

  it("uses only product-specific UGC directions, honors explicit requests and avoids the last direction", () => {
    const allowed = ["in_hand", "conversation", "street_interview", "demonstration"];
    const first = buildVideoAdPlan(input, '{"direction":"in_hand"}');
    const second = buildVideoAdPlan({ ...input, previousPrompt: videoPlanPrompt(first) }, '{"direction":"in_hand"}', () => 0);
    expect(first.direction).toBe("in_hand");
    expect(second.direction).not.toBe("in_hand");
    expect(buildVideoAdPlan({ ...input, userBrief: "un micro trottoir" }).direction).toBe("street_interview");
    expect(buildVideoAdPlan({ ...input, userBrief: "une discussion" }).direction).toBe("conversation");
    expect(eligibleVideoDirections(input).every(direction => allowed.includes(direction))).toBe(true);
    expect(eligibleVideoDirections({ ...input, hasReference: false })).not.toContain("in_hand");
    expect(eligibleVideoDirections(input)).not.toContain("visual_story");
  });

  it("shows an ebook's exact supplied cover on a device in both segments", () => {
    const plan = buildVideoProviderPlan(input, buildVideoAdPlan(input, '{"direction":"conversation"}'), input.description);
    for (const segment of plan.segments) {
      expect(segment.prompt).toContain("supplied ebook cover exactly as provided");
      expect(segment.prompt).toContain("phone or tablet in both segments");
      expect(segment.prompt).toContain("never redraw, replace");
      expect(segment.prompt).toContain("never redraw, replace");
      expect(segment.prompt).toContain("turn it into a printed book");
    }
  });

  it("keeps people even when a legacy brief asks for none, and invents no absent cover or claims", () => {
    const noReference: VideoAdInput = { ...input, hasReference: false, character: "without", userBrief: "Sans personnages, promets un résultat garanti en 3 jours." };
    const plan = buildVideoAdPlan(noReference, '{"direction":"in_hand","copyIndices":[0],"dialogue":"Résultat garanti en 3 jours"}', () => 0);
    const providerPlan = buildVideoProviderPlan(noReference, plan, noReference.description);
    expect(plan.direction).not.toBe("in_hand");
    for (const segment of providerPlan.segments) {
      expect(segment.prompt).toContain("Black or mixed-race");
      expect(segment.prompt).toContain("No visual reference was supplied");
      expect(segment.prompt).not.toMatch(/sans personnages|Résultat garanti en 3 jours/i);
    }
  });

  it("handles missing evidence, malformed answers, hostile fields and strange keys safely", () => {
    for (const answer of ["not JSON", "null", "[]", '{"direction":"__proto__","copyIndices":[-1,999,"0"],"claims":"Invented result"}']) {
      const plan = buildVideoAdPlan({ ...input, description: "", hasReference: false }, answer, () => 0);
      expect(plan.segments[0].prompt).not.toContain("Invented result");
      expect(plan.segments[0].prompt).toContain("No product image was supplied");
      expect(plan.segments[0].prompt).toContain("Black or mixed-race");
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
    const plan = buildVideoAdPlan(input, '{"direction":"demonstration"}');
    expect(plan.segments.reduce((n, s) => n + s.duration, 0)).toBe(25);
    expect(plan.segments.map(s => s.duration)).toEqual([15, 10]);
    expect(plan.segments.at(-1)?.prompt).toContain("portrait 9:16");
  });
});

describe("Slideshow preparation without generation", () => {
  it("prepares exactly 5 faithful images with transitions accounted for in the final 25s", () => {
    const plan = buildSlideshowPlan({ ...input, description: "Disponible au format PDF. Des exercices accompagnent chaque chapitre. La lecture est possible sans connexion.", duration: 25 });
    expect(plan.slides).toHaveLength(5);
    expect(plan.slides.reduce((sum, s) => sum + s.displaySeconds, 0) + 4 * plan.transitionSeconds).toBe(25);
    expect(new Set(plan.slides.map(s => s.prompt)).size).toBe(5);
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
