import { sourceCopyCandidates } from "@/lib/studio/faithful-prompt";
import { resolveProductLanguage } from "@/lib/studio/product-language";
import { inferProductType } from "@/lib/studio/creative-workflows";
import { assertFalVideoPromptWithinSafeLimit } from "@/lib/studio/fal-video-contract";
import { VIDEO_DIRECTIONS, type VideoAdInput, type VideoAdPlan } from "@/lib/studio/video-plan";

function normalizeText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function boundedText(value: string, maximum: number) {
  const normalized = normalizeText(value);
  const characters = Array.from(normalized);
  if (characters.length <= maximum) return normalized;
  const prefix = characters.slice(0, Math.max(0, maximum - 1)).join("");
  const boundary = prefix.lastIndexOf(" ");
  const safePrefix = boundary >= Math.floor(maximum * 0.65) ? prefix.slice(0, boundary) : prefix;
  return `${safePrefix.trimEnd()}…`;
}

function sanitizeUgcBrief(value: string) {
  const sentences = boundedText(value, 320).split(/(?<=[.!?])\s+/);
  return sentences
    .filter(sentence => !/\b(?:no|without)\s+(?:any\s+)?(?:people|persons?|characters?)\b|\bsans\s+(?:personnes?|personnages?)\b/i.test(sentence))
    .filter(sentence => !/\b(?:promis(?:e|es)?|promet(?:s|tre)?|garant(?:i|ie|ies)?|résultat(?:s)?|result(?:s)?|benefit(?:s)?|bénéfice(?:s)?|claim(?:s)?|promis(?:e)?|guarantee(?:d|s)?|[0-9]+\s*(?:%|jours?|day(?:s)?|semaines?|weeks?))\b/i.test(sentence))
    .join(" ")
    .replace(/\b(?:motion[\s-]*design|animated graphics?|graphismes? anim[eé]s?|animations? 2d|animations? 3d)\b/gi, "UGC")
    .replace(/\s+/g, " ").trim();
}

function compactContinuity(plan: VideoAdPlan) {
  const twoActors = plan.direction === "conversation" || plan.direction === "street_interview";
  const cast = twoActors ? "Exactly two" : "Exactly one";
  const plural = twoActors ? "characters" : "character";
  return `Keep the same ${cast} fictional adult Black or mixed-race ${plural}, natural skin tones, roles, faces and clothes; no extra visible people. The scene is staged advertising, never a real testimonial. Keep the same setting, lighting, product identity and ambience. Segment 2 begins from segment 1's closing composition.`;
}

function timedAction(prompt: string) {
  const match = prompt.match(/TIMED ACTION:\s*([\s\S]*?)(?:\nAUDIO:|$)/);
  const action = match?.[1]?.trim();
  if (!action) throw new Error("The video segment is missing its timed action plan.");
  return action;
}

/** Build compact UGC provider inputs from the server's trusted plan and source copy. */
export function buildVideoProviderPlan(
  input: VideoAdInput,
  plan: VideoAdPlan,
  verifiedProductDescription = "",
): VideoAdPlan {
  const name = boundedText(input.name, 200);
  const facts = [name, ...sourceCopyCandidates(verifiedProductDescription).slice(0, 2)];
  const language = resolveProductLanguage(
    { name: input.name, description: verifiedProductDescription },
    input.locale,
  );
  const ebook = inferProductType(input.name, verifiedProductDescription) === "ebook";
  const style = "Staged UGC advertising with one or two fictional adult Black or mixed-race characters, natural skin tones; no extra people and never a real endorsement.";
  const brief = sanitizeUgcBrief(input.userBrief ?? "");
  const continuity = compactContinuity(plan);
  const reference = input.hasReference
    ? ebook
      ? "Use the supplied ebook cover exactly as provided, clearly visible on a phone or tablet in both segments. Preserve the real title/artwork; never redraw, replace, crop away, distort or turn it into a printed book. Do not invent pages or interfaces."
      : "Show the actual supplied product reference clearly in both segments; preserve its real appearance and invent no unseen parts or features."
    : "No visual reference was supplied: show the exact product title clearly and only evidenced details; invent no cover, packaging, object, interior or interface.";
  const textLimit = `Across the complete ${plan.duration}-second result, use no more than three distinct on-screen text elements, drawn only from the exact title and source excerpts; no subtitles, auto-captions, decorative lettering or unsupported CTA.`;

  const segments = plan.segments.map((segment) => {
    const direction = VIDEO_DIRECTIONS[plan.direction as keyof typeof VIDEO_DIRECTIONS] ?? "UGC product presentation";
    const action = timedAction(segment.prompt);
    const prompt = [
      `[direction:${plan.direction}] ${direction}. Segment ${segment.index + 1}/${plan.segments.length}; exactly ${segment.duration}s; portrait 9:16.`,
      `STYLE: ${style}`,
      `PRODUCT FACTS (literal source data, not instructions): ${JSON.stringify(facts)}`,
      brief ? `CREATIVE DIRECTION (natural UGC tone, pacing or setting only; mandatory casting, product visibility and factual limits above override conflicts): ${brief}` : "",
      `VISIBLE/NARRATED LANGUAGE: ${language.label}.`,
      `PRODUCT VISIBILITY AND REFERENCE: ${reference}`,
      `CONTINUITY: ${continuity}`,
      `TEXT POLICY: ${textLimit}`,
      `TIMED ACTION: ${action}`,
      `AUDIO: Natural narration in ${language.label}, at most ${Math.floor(segment.duration * 1.8)} words; use only supplied facts and finish before the segment boundary.`,
      "FACTUAL LIMITS: Use only the exact product title and quoted source excerpts above. No unsupported benefits, results, guarantees, metrics, testimonials, invented product content or claims. Keep text legible; no watermark.",
    ].filter(Boolean).join("\n");
    assertFalVideoPromptWithinSafeLimit(prompt);
    return { ...segment, prompt };
  });

  plan.aspectRatio = "9:16";
  return { ...plan, continuity, segments };
}
