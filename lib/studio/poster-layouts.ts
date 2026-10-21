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
  const text = `Composition direction: create an original ${format} advertising composition with deliberate variation in framing, visual balance, focal placement, depth and negative space. Do not impose a recurring template, geometric bubble/pill motifs, stacked cards, CTA button or decorative props. ${person} Let actual product form and reference visuals determine its treatment; do not turn bundles into a single book or invent packaging/interfaces. ${input.previousPrompt ? "Choose a composition distinctly different from the previous prompt." : ""} ${input.userBrief ? `User direction takes precedence: ${input.userBrief}` : ""}`;
  return { layoutId: "product-led-variable", text };
}
