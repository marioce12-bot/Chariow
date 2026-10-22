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
    description: "Guide pour lancer des campagnes sur Snapchat. Le guide explique les réglages du ciblage. Il présente plusieurs exemples de publicités. Chaque chapitre détaille une étape de préparation. Les exercices accompagnent la lecture du guide. Une section décrit les indicateurs de suivi. Le document explique les formats publicitaires disponibles. Une liste rassemble les vérifications avant publication. Le chapitre du ciblage compare les audiences personnalisées et les audiences similaires à partir de critères explicitement décrits. Une fiche présente la préparation des images verticales avec une liste des dimensions et des zones réservées au texte. Le tableau de suivi comporte une colonne pour le budget quotidien et une autre pour les conversions observées. Un exercice demande de comparer deux messages publicitaires en gardant la même audience et le même budget. Le dernier chapitre décrit la consultation des rapports et la vérification des événements associés aux campagnes.",
  };
  const narration = [25, 30, 40].map(duration => {
    const plan = buildSlideshowVoicePlan(product, duration, "fr", "buy");
    return { duration, script: plan.script, words: plan.script.trim().split(/\s+/).length };
  });
  return NextResponse.json({ fixtureOnly: true, ...result, narration, ttsCalls: 0 }, { headers: { "Cache-Control": "no-store" } });
}
