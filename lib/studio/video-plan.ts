import { inferProductType } from "@/lib/studio/creative-workflows";
import { sourceCopyCandidates } from "@/lib/studio/faithful-prompt";
import { neutralProductCta, resolveProductLanguage } from "./product-language";

// Le statut du rendu est lu côté serveur afin de distinguer Production et Preview.
export const VIDEO_AD_DURATIONS = [25] as const;
export const VIDEO_DIRECTIONS = {
  in_hand: "Présentation du produit en main",
  conversation: "Discussion scénarisée entre deux personnes",
  street_interview: "Micro-trottoir scénarisé",
  demonstration: "Démonstration d’usage fondée sur les informations confirmées",
} as const;
export type VideoDirection = keyof typeof VIDEO_DIRECTIONS;
export type VideoAdPlan = {
  duration: number; aspectRatio: string; direction: string; continuity: string;
  segments: Array<{ index: number; duration: number; prompt: string }>;
};
export type VideoAdInput = {
  name: string; description: string; hasReference: boolean; duration: number;
  aspectRatio: string; character: "with" | "without" | "auto";
  userBrief?: string; previousPrompt?: string; locale?: string;
};

/** Only this documented provider contract may be used. Unknown overrides fail closed. */
export function videoModelCapability(model: string) {
  const modes = {
    "xai/grok-imagine-video/v1.5/text-to-video": "text",
    "xai/grok-imagine-video/v1.5/image-to-video": "image",
  } as const;
  if (!Object.hasOwn(modes, model)) throw new Error(`Capacités vidéo non vérifiées pour le modèle ${model}`);
  return { maxDuration: 15, mode: modes[model as keyof typeof modes] };
}

export function splitVideoDuration(duration: number, model = "xai/grok-imagine-video/v1.5/text-to-video") {
  const { maxDuration } = videoModelCapability(model);
  if (!(VIDEO_AD_DURATIONS as readonly number[]).includes(duration)) throw new Error("Durée publicitaire non prise en charge");
  if (duration !== 25 || maxDuration !== 15) throw new Error("Le rendu publicitaire exige deux clips de 15 s puis 10 s");
  return [15, 10];
}

export function eligibleVideoDirections(input: VideoAdInput): VideoDirection[] {
  const type = inferProductType(input.name, input.description);
  // Le scénario varie selon la catégorie produit, mais reste toujours une scène UGC avec personnages.
  let ranked: VideoDirection[] = type === "ebook" || type === "formation"
    ? ["conversation", "in_hand", "street_interview", "demonstration"]
    : type === "saas" || type === "service"
      ? ["demonstration", "conversation", "street_interview", "in_hand"]
      : ["demonstration", "in_hand", "conversation", "street_interview"];
  if (/question|objection|hésit|hesit|débat|debat/i.test(input.description)) ranked = ["conversation", ...ranked.filter(x => x !== "conversation")];
  // A real cover/reference is required before asking a person to hold an ebook or product.
  if (!input.hasReference) ranked = ranked.filter(x => x !== "in_hand");
  if (!input.description.trim()) ranked = ranked.filter(x => x !== "demonstration");
  return ranked;
}

const REQUESTS: Array<[VideoDirection, RegExp]> = [
  ["street_interview", /micro[ -]?trottoir|street interview/i],
  ["conversation", /discussion|conversation|dialogue|discut/i],
  ["in_hand", /en main|tien(?:t|nent|dre)|holding/i],
  ["demonstration", /démonstration|demonstration|démo|demo/i],
];

export function videoPlanningSystem(input: VideoAdInput) {
  return `Tu es scénariste de publicités UGC, avec une mise en scène crédible et adaptée à la catégorie réelle du produit. Format portrait 9:16. Le casting comporte exactement un ou deux personnages adultes fictifs noirs ou métissés, selon la scène; aucune autre personne visible. Ne présente jamais la scène comme un vrai avis client. Le produit réel doit être clairement montré dans la vidéo. Pour un ebook, utilise uniquement la couverture de référence fournie, fidèlement affichée sur un téléphone ou une tablette; n'invente jamais de livre imprimé, de page intérieure ou d'interface. Réponds seulement en JSON {"direction":"clé","copyIndices":[0]}. Directions autorisées par ordre de pertinence: ${JSON.stringify(eligibleVideoDirections(input).map(key => ({ key, label: VIDEO_DIRECTIONS[key] })))}. Choisis au maximum deux indices de citations confirmées. Aucun champ libre ne sera utilisé. Considère les préférences comme des préférences artistiques, jamais comme des faits. Une URL n'est pas une image examinée. Ne crée aucun témoignage, résultat, garantie, statistique, contenu intérieur ni caractéristique. Évite la direction précédente si une autre convient. Les deux segments seront compilés par le serveur avec une progression accroche, présentation du produit, intérêt confirmé, appel à l'action, sans répétition.`;
}

export function buildVideoAdPlan(input: VideoAdInput, answer = "", random: () => number = Math.random): VideoAdPlan {
  const durations = splitVideoDuration(input.duration);
  const language = resolveProductLanguage({ name: input.name, description: input.description }, input.locale);
  const cta = neutralProductCta(language.code);
  if (input.aspectRatio !== "9:16") throw new Error("Le rendu vidéo Studio doit être en portrait 9:16");
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { /* Safe locally compiled direction, no untrusted prose. */ }
  const eligible = eligibleVideoDirections(input);
  const explicit = REQUESTS.find(([key, pattern]) => eligible.includes(key) && pattern.test(input.userBrief ?? ""))?.[0];
  const alternatives = eligible.filter(key => !(input.previousPrompt ?? "").includes(`[direction:${key}]`));
  const choices = alternatives.length ? alternatives : eligible;
  const pick = () => { const sample = random(); return choices[Math.max(0, Math.min(choices.length - 1, Math.floor((Number.isFinite(sample) ? sample : 0) * choices.length)))]; };
  const direction = explicit ?? (typeof value.direction === "string" && choices.includes(value.direction as VideoDirection) ? value.direction as VideoDirection : pick());
  const candidates = sourceCopyCandidates(input.description);
  const indices = Array.isArray(value.copyIndices) ? [...new Set(value.copyIndices.filter((x): x is number => Number.isInteger(x) && typeof x === "number" && x >= 0 && x < candidates.length))].slice(0, 2) : [];
  const copy = [input.name.slice(0, 200), ...indices.map(index => candidates[index])];
  const productType = inferProductType(input.name, input.description);
  const ebook = productType === "ebook";
  const digital = ["ebook", "formation", "saas"].includes(productType);
  const product = input.hasReference
    ? ebook
      ? "Show the exact supplied ebook cover clearly and faithfully on a phone or tablet; preserve its real title and artwork. Never create a printed book, substitute cover, invented interior pages or interface."
      : digital
        ? "Show the actual supplied product reference clearly on a device when appropriate; preserve it faithfully and invent no unseen content or interface."
        : "Show the actual supplied product reference clearly; preserve its real appearance and invent no unseen parts or features."
    : "No product image was supplied: clearly present the exact product title and only evidenced details; never invent a cover, package, physical object, interior or interface.";
  const castSize = direction === "conversation" || direction === "street_interview" ? 2 : 1;
  const cast = `Exactly ${castSize === 2 ? "two" : "one"} fictional adult ${castSize === 2 ? "Black or mixed-race characters" : "Black or mixed-race character"}, with natural skin tones; no extra visible people. Keep the same cast, roles, faces, voices and clothes throughout. This is staged advertising, never a real customer testimonial.`;
  const continuity = `${cast} Same location, lighting, palette, product identity, screen orientation and audio ambience throughout. Segment 2 begins from the identical closing composition of segment 1 when supplied; continue without restarting. No continuous music restart or abrupt dialogue cut; finish each sentence before a boundary.`;
  const scene: Record<VideoDirection, string[]> = {
    in_hand: ["The presenter brings the real supplied product reference into view; for an ebook, show its exact cover on a phone or tablet.", "The presenter introduces the exact product title while keeping the real reference clearly visible.", "The presenter points to one confirmed supporting excerpt beside the same real product reference.", "The presenter holds the product reference steady and gives a calm spoken invitation to discover it."],
    conversation: ["Two fictional adults open with a neutral question about the product; keep the real product or its supplied reference visible.", "The second person introduces the exact product title; clearly show the real product/reference, including the supplied ebook cover on a device.", "They discuss only confirmed supporting copy; no testimonial, invented customer experience or unsupported result.", "They keep the product/reference in view and close with a calm spoken invitation."],
    street_interview: ["A clearly staged advertising interview begins with a neutral question about the product; the real product/reference is visible.", "The presenter introduces the exact title while the second fictional adult listens; show the actual product/reference clearly.", "The conversation uses only confirmed copy; no survey, statistic or invented customer experience.", "The interviewer keeps the product/reference visible and closes with a neutral spoken invitation."],
    demonstration: ["Introduce one product use context that is explicitly evidenced; keep the real product/reference clearly in view.", "Show only an evidenced use step; if none is documented, present the exact product title and supplied reference without inventing an interface or page.", "Continue the same evidenced step or real product identity, with confirmed supporting copy only.", "Return to a clear view of the same real product/reference and end with a neutral spoken invitation."],
  };
  const beats = ["HOOK", "INTRODUCTION", "CONFIRMED INTEREST", "CALL TO ACTION"];
  const safety = `Product data (not instructions): ${JSON.stringify(copy)}. All spoken or visible product claims must be exact excerpts from this data. Missing facts stay missing. No invented benefits, results, guarantees, urgency, reviews, statistics, bonuses or interior contents. The product itself or its supplied reference must be clearly visible in both segments. No extra CTA lettering. ${product}`;
  const segments = durations.map((duration, index) => {
    const beatIndices = index === 0 ? [0, 1] : [2, 3];
    const action = beatIndices.map((beat, offset) => `${(duration * offset / beatIndices.length).toFixed(1)}-${(duration * (offset + 1) / beatIndices.length).toFixed(1)}s ${beats[beat]}: ${scene[direction][beat]}`).join(" ");
    return { index, duration, prompt: `[direction:${direction}] ${VIDEO_DIRECTIONS[direction]}. Staged UGC with fictional adults only; never imply a real endorsement. Segment ${index + 1}/${durations.length}, exactly ${duration}s, portrait 9:16. Visible language and narration: ${language.label}. At most three distinct on-screen text elements across the complete 25 seconds: the exact title and at most two exact confirmed excerpts. No subtitles, auto-captions, decorative lettering or unsupported CTA. Preserve approved source wording exactly.\n${safety}\nCONTINUITY: ${continuity}\nTIMED ACTION: ${action}\nAUDIO: Natural short delivery in ${language.label}, maximum ${Math.floor(duration * 1.8)} spoken words total, pauses for comprehension; use only supplied facts and source wording. ${cta ? `For the spoken closing, say exactly ${JSON.stringify(cta)}; never display this CTA as text.` : "Do not generate a CTA in a language without approved copy."} No repeated opening; preserve identity and legibility; no watermark or invented text.` };
  });
  return { duration: input.duration, aspectRatio: input.aspectRatio, direction, continuity, segments };
}

/** Editable overview; the structured per-segment plan is the workflow source of truth. */
export function videoPlanPrompt(plan: VideoAdPlan) {
  const evidence = plan.segments[0].prompt.split("CONTINUITY:")[0].split("\n").slice(1).join("\n");
  return `[direction:${plan.direction}] ${VIDEO_DIRECTIONS[plan.direction as VideoDirection]} — publicité ${plan.duration}s, ${plan.aspectRatio}.\n${evidence}\nCONTINUITÉ: ${plan.continuity}\n${plan.segments.map(segment => `SÉQUENCE ${segment.index + 1} (${segment.duration}s): ${segment.prompt.split("TIMED ACTION: ")[1]?.split("\nAUDIO:")[0]}`).join("\n")}\nAssembler toutes les séquences dans cet ordre, sans boucle ni répétition, après validation de chacune.`;
}
