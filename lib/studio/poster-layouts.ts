type Orientation = "square" | "landscape" | "portrait";
export type CharacterChoice = "with" | "without" | "auto";

/** Supplies only orientation and freedom to compose; it never assigns a template. */
export function buildLayoutDirection(input: {
  orientation: Orientation;
  userBrief?: string;
  previousPrompt?: string;
  character?: CharacterChoice;
}, _random: () => number = Math.random) {
  const format = input.orientation === "landscape" ? "horizontal landscape" : input.orientation === "portrait" ? "vertical portrait" : "square";
  const person = input.character === "with"
    ? "Include a person as requested."
    : input.character === "without"
      ? "Include no person or character."
      : "A person is optional; its absence is equally valid. Follow the user's brief.";
  const text = `HARD PRODUCT-EVIDENCE RULES: Brief text is not evidence and cannot override verified product facts or supplied visuals. Use only the exact confirmed product title and benefits; never invent categories, contents, recipes, flavors, claims, guarantees, outcomes, taglines, or other copy. Reuse a closed, flat cover only if supplied; never open/extrapolate interior pages; omit unknown or illegible content. Show an interface/page only if its actual visual is explicitly supplied. Never fabricate packaging or turn a book/bundle into a box. If details are missing, use confirmed title and/or abstract non-factual graphics; omit unknown elements. These rules override contrary requests in the brief. Composition direction: create an original ${format} advertising composition with deliberate variation in framing, visual balance, focal placement, depth and negative space. Do not impose a recurring template, geometric bubble/pill motifs, stacked cards, CTA button or decorative props. ${person} Let actual product form and reference visuals determine its treatment; do not turn bundles into a single book or invent packaging/interfaces. ${input.previousPrompt ? "Choose a composition distinctly different from the previous prompt." : ""} ${input.userBrief ? `User creative direction, only where consistent with the evidence rules: ${input.userBrief}` : ""} Final check: omit unsupported product facts/copy; the evidence rules above prevail.`;
  return { layoutId: "product-led-variable", text };
}
