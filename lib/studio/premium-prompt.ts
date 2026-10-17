type PremiumPromptInput = {
  prompt: string;
  orientation: "square" | "landscape" | "portrait";
  background: "auto" | "opaque" | "transparent";
  hasReferences: boolean;
};

const ORIENTATION_GUIDANCE: Record<PremiumPromptInput["orientation"], string> = {
  square: "Use a balanced 1:1 composition with a clear focal point, strong top or side headline area, and a clean lower CTA zone.",
  landscape: "Use a premium horizontal composition with a clear text-to-visual split, strong left-to-right reading flow, and generous edge-safe margins.",
  portrait: "Use a vertical social composition with the headline in the upper third, the hero subject in the middle, and a high-contrast CTA in the lower safe zone.",
};

/**
 * Adds a model-facing art-direction layer without rewriting the user's brief.
 * The user's prompt remains the source of truth; this wrapper standardizes the
 * visual decisions that make Studio generations feel like finished campaigns.
 */
export function buildPremiumImagePrompt(input: PremiumPromptInput) {
  const backgroundRule = input.background === "transparent"
    ? "The final background must be genuinely transparent; keep the subject fully separated with clean edges and no fake checkerboard."
    : "Use a complete, intentional background with depth, clean lighting, and no unfinished empty canvas.";

  const referenceRule = input.hasReferences
    ? "Treat the supplied reference images as approved visual references. Preserve only the requested identity, product, palette, composition, or style cues; do not blindly copy unrelated logos, text, or artifacts. Keep identity and product appearance consistent across references."
    : "If a person or product is requested, establish stable visual anchors: age, skin tone, face shape, hairstyle, wardrobe, silhouette, materials, and lighting.";

  return `You are a senior art director and high-end commercial image prompt engineer. Create the final visual, not a rough concept. The user's brief below is the source of truth: follow every explicit subject, language, product, text, brand, reference, and exclusion request exactly. Do not invent claims, prices, logos, statistics, testimonials, or extra copy.

USER BRIEF (preserve its meaning and exact visible wording):
${input.prompt.trim()}

PRODUCTION STANDARD:
- ${ORIENTATION_GUIDANCE[input.orientation]}
- Build a deliberate visual hierarchy: one unmistakable focal point, a readable headline or message zone, supporting details, then a clear CTA or closing area when requested.
- Use sophisticated art direction: intentional negative space, layered depth, controlled contrast, premium materials, coherent perspective, realistic shadows, refined color relationships, and a polished advertising finish.
- Avoid the default SaaS/template look: do not stack three identical white cards, do not use a generic top banner plus bottom button, and do not make the composition feel like a dashboard or catalog tile. Prefer an editorial asymmetry, varied information shapes, tactile details, organic graphic forms, subtle overlaps, and a visual rhythm that connects the person, product, headline, and CTA.
- If text is requested, render the exact wording in the requested language with perfect spelling, accents, punctuation, capitalization, and line breaks. Keep text short, large, high-contrast, well-spaced, and inside safe margins. Never replace required text with placeholder text or random lettering.
- If a person is requested, make them look like a real person photographed for a premium campaign, never like a 3D render or an illustration: authentic skin texture with subtle pores and natural tonal variation, believable catchlights and eye focus, realistic facial asymmetry, detailed hair strands and flyaways, correct anatomy and proportions, relaxed shoulders, expressive but anatomically correct hands and gestures, natural fabric behavior, and a wardrobe that supports the product's positioning. Use refined commercial portrait lighting, realistic depth of field, nuanced micro-expression, and a human presence that feels spontaneous rather than synthetic. Avoid plastic skin, waxy faces, dead eyes, duplicated fingers, fused hands, distorted faces, mannequin poses, and generic stock-photo posing.
- If a product, ebook, device, package, or interface is requested, make it the hero: physically plausible proportions, readable requested label, premium lighting, no melting geometry, no accidental extra branding, and no object hidden behind the subject.
- Choose the palette and styling from the brief. Use a restrained professional palette with one dominant color, one supporting color, and one accent. Keep contrast strong enough for immediate mobile readability without making the design noisy.
- ${referenceRule}
- ${backgroundRule}
- The result must feel like a finished campaign asset designed by an elite creative studio: elegant, contemporary, conversion-aware, and visually memorable. Avoid generic stock photography, clutter, flat unstyled layouts, weak hierarchy, tiny text, excessive effects, over-saturated gradients, fake logos, watermarks, and AI artifacts.`;
}
