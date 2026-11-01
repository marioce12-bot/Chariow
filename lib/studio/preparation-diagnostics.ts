import { InsufficientProductDetailsError } from "@/lib/studio/slideshow-plan";

export type PreparationStage = "voice_gate" | "voice_plan" | "slideshow_plan" | "prompt_plan";

// Match only fixed, locally defined messages. Never emit the original error,
// stack, request body, product, prompt, narration, or environment variables.
const KNOWN_REASONS = new Map([
  ["TTS diaporama réservé aux environnements preview ou production autorisés.", "VOICE_ENVIRONMENT_UNSUPPORTED"],
  ["La voix off n’est pas encore activée dans cet environnement. Aucun appel vocal effectué.", "VOICE_DISABLED"],
  ["Voix off bloquée : le palier gratuit Gemini doit être confirmé. Aucune offre payante utilisée.", "VOICE_FREE_TIER_UNCONFIRMED"],
  ["Invalid narration word budget", "VOICE_WORD_BUDGET_INVALID"],
  ["Nom du produit trop long pour le budget vocal de cette durée; TTS non lancé.", "VOICE_PRODUCT_NAME_TOO_LONG"],
  ["Nom et CTA complet dépassent le budget vocal; TTS non lancé.", "VOICE_CTA_BUDGET_EXCEEDED"],
]);

function preparationReason(error: unknown): string {
  if (error instanceof InsufficientProductDetailsError) return "INSUFFICIENT_PRODUCT_DETAILS";
  if (!(error instanceof Error)) return "UNEXPECTED_PREPARATION_ERROR";
  const known = KNOWN_REASONS.get(error.message);
  if (known) return known;
  if (/^Textes trop similaires sur les images [1-5] et [1-5]\. Ajoute des informations produit distinctes avant de générer\.$/.test(error.message)) return "STORYBOARD_TEXT_TOO_SIMILAR";
  if (/^Visuels trop similaires sur les images [1-5] et [1-5]\. Prépare un storyboard distinct avant de générer\.$/.test(error.message)) return "STORYBOARD_VISUAL_TOO_SIMILAR";
  return "UNEXPECTED_PREPARATION_ERROR";
}

export function logPreparationFailure(taskId: string, stage: PreparationStage, error: unknown): void {
  // Diagnostics must never turn an ordinary refusal into an unhandled failure.
  try {
    console.warn(JSON.stringify({
      event: "studio_preparation_failed",
      taskId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId) ? taskId : null,
      stage: ["voice_gate", "voice_plan", "slideshow_plan", "prompt_plan"].includes(stage) ? stage : "unknown",
      reason: preparationReason(error),
      status: 400,
    }));
  } catch { /* Best-effort, server-only diagnostics. */ }
}
