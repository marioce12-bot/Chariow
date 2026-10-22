import { FatalError } from "workflow";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";

/** Preview-only smoke test of queue delivery across seven independent steps.
 * Immutable fixture: no DB, media, provider, billing or credit module is imported. */
export async function studioTaskFixtureWorkflow() {
  "use workflow";
  const revisions: number[] = [];
  for (let revision = 0; revision < 7; revision++) {
    revisions.push(await fixtureStage(revision));
  }
  return { revisions, completedImages: 5, studioCreditsConsumed: 0 };
}
export async function fixtureStage(revision: number) {
  "use step";
  if (process.env.VERCEL_ENV !== "preview") throw new FatalError("PREVIEW_FIXTURE_ONLY");
  const plan = buildSlideshowPlan({
    name: "Guide Snapchat", description: "Guide pour lancer des campagnes sur Snapchat. Le guide détaille le ciblage. Il présente des exemples de campagnes. Les étapes sont organisées par niveau.",
    duration: 25, aspectRatio: "9:16", hasReference: false, character: "with", locale: "fr", campaignGoal: "buy",
  });
  if (plan.slides.length !== 5 || plan.slides[4].headline !== "Prêt à lancer tes campagnes sur Snapchat ? Procure-toi le guide") throw new FatalError("FIXTURE_STORYBOARD_MISMATCH");
  return revision;
}
fixtureStage.maxRetries = 0;
