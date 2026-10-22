import { buildSlideshowVoicePlan, synthesizeSlideshowVoice, type SlideshowVoicePlan } from "./slideshow-voice";

/** Internal diagnostics only. Public boundaries must use the friendly slideshow error copy. */
export class SlideshowVoiceTimingError extends Error {
  constructor(readonly reason: "short" | "long", readonly audibleEnd: number, readonly sourceDuration: number, message: string) {
    super(message);
    this.name = "SlideshowVoiceTimingError";
  }
}
export const MAX_SLIDESHOW_VOICE_ATTEMPTS = 3;
// The render worker has a 300s ceiling. Reserve time for local assembly/storage;
// this is a single shared budget, not another 90s allowance on each correction.
export const SLIDESHOW_VOICE_BUDGET_MS = 180_000;
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Only a successfully returned, measured clip can trigger another synthesis.
 * Network, quota, access, timeout and invalid-audio failures are never retried.
 * Each attempt speaks a fresh complete script, not concatenated or looped audio.
 */
export async function synthesizeCoveredSlideshowVoice(
  initialPlan: SlideshowVoicePlan,
  input: { product: { name: string; description?: string }; locale?: string; campaignGoal?: unknown },
  prepare: (audio: Buffer, attempt: number) => Promise<string>,
  synthesize: (plan: SlideshowVoicePlan, timeoutMs: number) => Promise<Buffer> = (plan, timeoutMs) => synthesizeSlideshowVoice(plan, fetch, timeoutMs),
): Promise<{ plan: SlideshowVoicePlan; voicePath: string; attempts: number }> {
  let plan = initialPlan;
  const seen = new Set<string>();
  const deadline = Date.now() + SLIDESHOW_VOICE_BUDGET_MS;
  for (let attempt = 1; attempt <= MAX_SLIDESHOW_VOICE_ATTEMPTS; attempt++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("Narration time budget exhausted");
    seen.add(plan.script);
    // Intentionally outside the timing catch: an uncertain provider result must not repeat.
    const audio = await synthesize(plan, remainingMs);
    try {
      const voicePath = await prepare(audio, attempt);
      return { plan, voicePath, attempts: attempt };
    } catch (error) {
      if (!(error instanceof SlideshowVoiceTimingError) || attempt === MAX_SLIDESHOW_VOICE_ATTEMPTS) throw error;
      if (!Number.isFinite(error.audibleEnd) || error.audibleEnd <= 0 || !Number.isFinite(error.sourceDuration)) throw error;
      const currentWords = wordCount(plan.script);
      const pace = currentWords / error.audibleEnd;
      // Aim just beyond the safe speech window. Small overruns may be accelerated
      // locally (<=1.2x); never slow, stretch, repeat or truncate spoken content.
      const targetWords = Math.ceil(pace * (plan.duration - 0.4) * 1.02);
      const minimumWords = error.reason === "short" ? Math.max(currentWords + 1, targetWords) : targetWords;
      const maxWords = Math.floor(pace * (plan.duration - 0.4) * 1.14);
      if (minimumWords > maxWords) throw error;
      const next = buildSlideshowVoicePlan(input.product, plan.duration, initialPlan.language, input.campaignGoal, { minimumWords, maxWords });
      // Insufficient new source material does not justify another identical request.
      if (seen.has(next.script) || (error.reason === "short" && wordCount(next.script) <= currentWords) ||
          (error.reason === "long" && wordCount(next.script) >= currentWords)) throw error;
      plan = next;
    }
  }
  throw new Error("Narration unavailable");
}
