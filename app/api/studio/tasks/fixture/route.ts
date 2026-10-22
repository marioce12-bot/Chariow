import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { studioTaskFixtureWorkflow } from "@/lib/studio/task-workflow-fixture";
import { buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
export const runtime = "nodejs";
export const maxDuration = 90;
/** Accepts no task/user/product/provider inputs. No TTS call is made here.
 * Production always returns 404. Preview is protected by Vercel authentication. */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const run = await start(studioTaskFixtureWorkflow, []);
  const result = await run.returnValue;
  const product = {
    name: "Guide Snapchat",
    description: "Guide pour lancer des campagnes sur Snapchat. Le guide explique les réglages du ciblage. Il présente plusieurs exemples de publicités. Chaque chapitre détaille une étape de préparation. Les exercices accompagnent la lecture du guide. Une section décrit les indicateurs de suivi. Le document explique les formats publicitaires disponibles. Une liste rassemble les vérifications avant publication.",
  };
  const narration = [25, 30, 40].map(duration => {
    const plan = buildSlideshowVoicePlan(product, duration, "fr", "buy");
    return { duration, script: plan.script, words: plan.script.trim().split(/\s+/).length };
  });
  return NextResponse.json({ fixtureOnly: true, ...result, narration, ttsCalls: 0 }, { headers: { "Cache-Control": "no-store" } });
}
