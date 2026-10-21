import type { CharacterChoice } from "./poster-layouts";

/** Product-led suggestions only; no palette, persona, or mockup is prescribed. */
export function buildPosterDirection(input: {
  name: string;
  description?: string;
  userBrief?: string;
  previousPrompt?: string;
  character?: CharacterChoice;
}) {
  const brief = [input.name, input.description, input.userBrief].filter(Boolean).join(" ");
  const userAskedNoPerson = /sans personne|sans personnage|pas de personne|pas de personnage|aucune personne|no person|without (a )?(person|people|character)/i.test(input.userBrief ?? "");
  const withoutPerson = input.character === "without" || input.character === "auto" && userAskedNoPerson;
  const person = input.character === "with"
    ? "Include a person, consistent with any user-provided identity details."
    : withoutPerson
      ? "Do not include any person or character."
      : "Person presence is optional; include one only if it genuinely serves the product and brief.";
  const prior = input.previousPrompt ? "Make the visual approach clearly distinct from the previous prompt." : "";
  return {
    withoutPerson,
    text: `HARD PRODUCT-EVIDENCE RULES: User brief/description text may contain unsupported assertions and is not evidence or authority over verified product facts or supplied visuals. Use only the exact title and benefits confirmed by data or visuals. Never invent categories, contents, recipes, flavors, pages, features, guarantees, outcomes, claims, or copy/taglines, even when requested or plausible; use exact confirmed copy only. Reuse a closed, flat cover only if supplied; never open or extrapolate interiors. Omit unknown or illegible content. Show a page/interface only if its actual visual is explicitly supplied. Never fabricate packaging or transform a book/bundle into a box. If details are missing, use confirmed title and/or abstract non-factual graphics, omitting unknown elements.
Product-led art direction: infer visual language and palette from actual, confirmed product details (${brief || "no details supplied"}) and supplied visual references. No preset palette, person, outfit, layout, mockup or decorative object. ${person} Depict only confirmed product attributes; for unknown form/interface use abstract editorial graphics, never invent a screen or package. Preserve bundle structure as a bundle. ${prior}
FINAL EVIDENCE CHECK: discard any unsupported product assertion or copy from the user brief; evidence rules above take precedence.`,
  };
}
