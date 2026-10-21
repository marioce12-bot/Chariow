type PremiumPromptInput = {
  prompt: string;
  orientation: "square" | "landscape" | "portrait";
  background: "auto" | "opaque" | "transparent";
  hasReferences: boolean;
};

const ORIENTATION_GUIDANCE: Record<PremiumPromptInput["orientation"], string> = {
  square: "Use a balanced 1:1 composition with a clear focal point and safe margins; choose text and focal placement to suit the brief.",
  landscape: "Use an original horizontal composition with readable flow and generous edge-safe margins; avoid a fixed text-to-visual split.",
  portrait: "Use an original vertical social composition with safe margins; choose hierarchy and focal placement to suit the brief.",
};

/**
 * Adds non-prescriptive model-facing art direction without rewriting the user's brief.
 */
export function buildPremiumImagePrompt(input: PremiumPromptInput) {
  const backgroundRule = input.background === "transparent"
    ? "The final background must be genuinely transparent; keep the subject fully separated with clean edges and no fake checkerboard."
    : "Use a complete, intentional background with depth, clean lighting, and no unfinished empty canvas.";

  const referenceRule = input.hasReferences
    ? "By default, treat product references as evidence for actual product identity, branding and palette only, not as composition or person templates. If the user explicitly requests a reference's composition or style, honor that request. Otherwise make a distinct campaign and do not copy promotional motifs."
    : "Do not infer a person, packaging, or interface unless the brief establishes it; preserve supplied product facts.";

  return `You are a senior art director and high-end commercial image prompt engineer. Create the final visual, not a rough concept. The user's brief below is the source of truth: follow every explicit subject, language, product, text, brand, reference, and exclusion request exactly. Do not invent claims, prices, logos, statistics, testimonials, or extra copy.

USER BRIEF (preserve its meaning and exact visible wording):
${input.prompt.trim()}

PRODUCTION STANDARD:
- ${ORIENTATION_GUIDANCE[input.orientation]}
- Build a deliberate visual hierarchy and a clear focal point; use a CTA only when requested.
- Use sophisticated art direction: intentional negative space, layered depth, controlled contrast, premium materials, coherent perspective, realistic shadows, refined color relationships, and a polished advertising finish.
- Avoid a recurring composition or stock motifs such as bubbles, pills, stacked cards, geometric frames or generic CTA buttons. Vary composition, framing, balance, visual language, and negative space to suit the actual product.
- If text is requested, render the exact wording in the requested language with perfect spelling, accents, punctuation, capitalization, and line breaks. Keep text short, large, high-contrast, well-spaced, and inside safe margins. Never replace required text with placeholder text or random lettering.
- If a person is explicitly requested, depict them naturally and respectfully; never presume gender, outfit, or demographic, and do not require a person when absent from the brief. Avoid distorted anatomy and synthetic stock-photo posing.
- Depict the product faithfully to its actual type and supplied details. Keep bundles as bundles; do not default to a book, ebook, box or interface. Never invent product contents, packaging or interface. Where its form is unknown, use abstract editorial graphics rather than a fabricated mockup. No accidental branding.
- Choose palette and styling from actual product facts and supplied references. Preserve product identity; don't copy reference-ad composition or motifs.
- ${referenceRule}
- ${backgroundRule}
- The result must feel like a finished campaign asset designed by an elite creative studio: elegant, contemporary, conversion-aware, and visually memorable. Avoid generic stock photography, clutter, flat unstyled layouts, weak hierarchy, tiny text, excessive effects, over-saturated gradients, fake logos, watermarks, and AI artifacts.`;
}
