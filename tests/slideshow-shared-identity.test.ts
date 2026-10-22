import { describe, expect, it } from "vitest";
import { assertSlideshowPlan, buildSlideshowPlan, type SlideshowPlan } from "@/lib/studio/slideshow-plan";
import { nearDuplicate } from "@/lib/studio/slideshow-distinctness";

const input = {
  name: "PACK DE 16 OUVRAGES EN FINANCE ET SCIENCES ÉCONOMIQUES",
  description: "Les chapitres présentent les mécanismes des marchés financiers et leurs instruments.\nDes études de cas expliquent les politiques monétaires et leurs effets sur l'économie.\nDes exercices corrigés accompagnent les calculs budgétaires.",
  duration: 25, aspectRatio: "9:16", hasReference: true, character: "with" as const, locale: "fr",
};
function replaceCopy(plan: SlideshowPlan, index: number, headline: string) {
  const slide = plan.slides[index];
  slide.prompt = slide.prompt.replace(JSON.stringify([slide.headline, ...slide.supportingCopy, `${index + 1}/5`]), JSON.stringify([headline, ...slide.supportingCopy, `${index + 1}/5`]))
    .replace(`VISUAL MESSAGE: ${slide.visualMessage}\n`, `VISUAL MESSAGE: ${headline}\n`);
  slide.headline = headline; slide.visualMessage = headline;
}
describe("Product identity is not a repeated advertising argument", () => {
  it.each([25, 30, 40])("prepares and round-trips the five-image plan at %is without providers", duration => {
    for (const locale of ["fr", "en"]) for (const campaignGoal of ["discover", "buy", "learn", "contact"]) {
      const plan = buildSlideshowPlan({ ...input, duration, locale, campaignGoal });
      expect(plan.slides).toHaveLength(5);
      expect(plan.slides[0].headline).toContain(input.name);
      expect(plan.slides[4].headline).toContain(input.name);
      // Demonstrates the previous false positive, without weakening the generic matcher.
      expect(nearDuplicate(plan.slides[0].headline, plan.slides[4].headline)).toBe(true);
      expect(plan.slides.slice(1, 4).map(slide => slide.source?.excerpt)).toEqual(input.description.split("\n"));
      expect(() => assertSlideshowPlan(JSON.parse(JSON.stringify(plan)))).not.toThrow();
    }
  });
  it("still rejects actual repeated opening/closing actions after removing identity", () => {
    const plan = buildSlideshowPlan(input);
    replaceCopy(plan, 0, `Découvre «${input.name}»`);
    replaceCopy(plan, 4, `Explore «${input.name}»`);
    expect(() => assertSlideshowPlan(plan)).toThrow("Textes trop similaires");
  });
  it("still rejects a repeated title without a distinct message", () => {
    const plan = buildSlideshowPlan(input);
    replaceCopy(plan, 0, input.name); replaceCopy(plan, 4, input.name);
    expect(() => assertSlideshowPlan(plan)).toThrow("Textes trop similaires");
  });
  it("never exempts evidence beats, even when the title occurs in both", () => {
    const plan = buildSlideshowPlan(input);
    replaceCopy(plan, 1, `Découvre «${input.name}»`);
    expect(() => assertSlideshowPlan(plan)).toThrow("Textes trop similaires");
  });
  it("preserves validation for legacy plans without productName", () => {
    const plan = buildSlideshowPlan({ ...input, name: "Atlas" });
    delete plan.productName;
    expect(() => assertSlideshowPlan(plan)).not.toThrow();
  });
});
