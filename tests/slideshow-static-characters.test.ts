import { afterEach, describe, expect, it } from "vitest";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";

const input = {
  name: "Produit Atlas",
  description: "Le fichier est disponible au format PDF.\nDes exercices accompagnent chaque chapitre.\nLa lecture est possible sans connexion.",
  hasReference: true,
  duration: 25,
  aspectRatio: "9:16",
  character: "without" as const,
};
const originalVercelEnv = process.env.VERCEL_ENV;
afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("slideshow static characters by deployment environment", () => {
  it("adds frozen still-photography constraints only in Preview and retains character identity", () => {
    process.env.VERCEL_ENV = "preview";
    const plan = buildSlideshowPlan(input);
    expect(plan.slides).toHaveLength(5);
    for (const slide of plan.slides) {
      expect(slide.prompt).toContain("Include one clearly visible, staged person in every image");
      expect(slide.prompt).toContain("medium warm brown/golden-brown skin");
      expect(slide.prompt).toContain("do not infer ethnicity, ancestry, nationality or origin");
      expect(slide.prompt).toContain("PREVIEW STILL-PHOTOGRAPHY DIRECTION");
      expect(slide.prompt).toContain("frozen still-photo subject");
      expect(slide.prompt).toContain("no gesture sequence, actor performance, mouth animation, body animation, or character motion");
      expect(slide.prompt).toContain("All motion belongs to graphic elements, framing, and locally assembled transitions only");
      expect(slide.prompt.length).toBeLessThanOrEqual(4000);
    }
  });

  it.each(["production", "development", ""])("keeps the legacy character prompt in %s", environment => {
    process.env.VERCEL_ENV = environment;
    const plan = buildSlideshowPlan(input);
    for (const slide of plan.slides) {
      expect(slide.prompt).toContain("Include one clearly visible, staged person in every image");
      expect(slide.prompt).toContain("medium warm brown/golden-brown skin");
      expect(slide.prompt).not.toContain("PREVIEW STILL-PHOTOGRAPHY DIRECTION");
      expect(slide.prompt).not.toContain("frozen still-photo subject");
      expect(slide.prompt.length).toBeLessThanOrEqual(4000);
    }
  });
});
