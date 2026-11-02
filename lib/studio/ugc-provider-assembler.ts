import type { UgcCreativeDirection, UgcGeneratorInput } from "./ugc-prompt-generator";
import type { VideoAdPlan } from "./video-plan";
import { inferProductType } from "./creative-workflows";
import { assertFalVideoPromptWithinSafeLimit } from "./fal-video-contract";

function context(input: UgcGeneratorInput, creative: UgcCreativeDirection) {
  const ebook = inferProductType(input.product.name, input.product.description) === "ebook";
  return [
    `UGC staged advertising; portrait 9:16; language ${input.options.language}. Product: ${input.product.name}.`,
    `SCENE: ${JSON.stringify(creative.scene)}`,
    `CAST (same throughout, fictional adults only, Black or mixed-race): ${JSON.stringify(creative.characters)}`,
    ebook ? "REAL PRODUCT: show the supplied exact ebook cover clearly on a phone/tablet in BOTH clips. Preserve its title/artwork; never redraw it, invent pages or create a printed book." : "REAL PRODUCT: show the selected real reference in BOTH clips, close-up and in its evidenced use; invent no features, packaging or interface. For services show the real supplied brand/reference in its relevant life context.",
    "FACTS: Product name and supplied description are the only factual source. No invented numerical claims, guarantees, certifications, real endorsements, medical or income promises. A staged character is not a real customer testimonial. Assumptions concern staging only, never product facts.",
  ].join("\n");
}
function shotLine(shot: UgcCreativeDirection["shots"][number], start: number, end: number, offset: number) {
  const words = shot.dialogue.trim().split(/\s+/).filter(Boolean);
  const span = shot.end - shot.start;
  const from = Math.round(((start - shot.start) / span) * words.length);
  const until = Math.round(((end - shot.start) / span) * words.length);
  const dialogue = words.slice(from, until).join(" ");
  return `${start - offset}-${end - offset}s [${shot.type}]: ${shot.visual}; ACTION: ${start > shot.start ? "Continue the same action without restarting. " : ""}${shot.action}; CAMERA: ${shot.camera}; SAY VERBATIM: ${JSON.stringify(dialogue)}.`;
}
/** Provider-independent editable text; no creative decisions or LLM call in this file. */
export function compileUgcPrompt(input: UgcGeneratorInput, creative: UgcCreativeDirection): string {
  const prompt = [
    context(input, creative), `DURATION: ${input.options.duration}s. ANGLE: ${creative.angle}.`,
    `HOOK: ${creative.hook.text}; visual: ${creative.hook.visual}.`,
    ...creative.shots.map(shot => shotLine(shot, shot.start, shot.end, 0)),
    `FINAL CTA (once): ${creative.cta}`, `NEGATIVE: ${creative.negative_prompt}`,
  ].join("\n");
  if (prompt.length > 4000) throw new Error("Le scénario est trop détaillé pour le prompt éditable. Régénère une version concise.");
  return prompt;
}
/** Fal adapter: only split the validated timing; preserve exact scripted speech in order. */
export function compileUgcProviderPlan(input: UgcGeneratorInput, creative: UgcCreativeDirection): VideoAdPlan {
  if (input.options.duration !== 25) throw new Error("Cette Preview rend uniquement 25 secondes (15 + 10).");
  const continuity = "Same exact characters, faces, clothes, setting, lighting and real product; clip 2 starts from clip 1 closing frame, continuing action and speech without repeating the hook. Natural speech, no extra people, no fake endorsements.";
  const segments = [15, 10].map((duration, index) => {
    const offset = index === 0 ? 0 : 15;
    const shots = creative.shots.filter(shot => shot.start < offset + duration && shot.end > offset);
    const prompt = [
      context(input, creative), `CLIP ${index + 1}/2: exactly ${duration}s of the complete 25s story. ANGLE: ${creative.angle}.`,
      `CONTINUITY: ${continuity}`,
      ...shots.map(shot => shotLine(shot, Math.max(offset, shot.start), Math.min(offset + duration, shot.end), offset)),
      index === 1 ? `FINAL CTA (say once, not in addition if already scripted): ${creative.cta}` : "Do not repeat or anticipate the final CTA.",
      "AUDIO: natural dialogue exactly as scripted in the requested language; finish each line inside its allocated time. No auto-captions or watermark.",
      `NEGATIVE: ${creative.negative_prompt}`,
    ].join("\n");
    assertFalVideoPromptWithinSafeLimit(prompt);
    return { index, duration, prompt };
  });
  return { duration: 25, aspectRatio: "9:16", direction: creative.angle, continuity, segments };
}
