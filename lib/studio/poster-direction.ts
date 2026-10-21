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
    text: `Product-led art direction: infer visual language and palette from the actual product details (${brief || "no details supplied"}) and any supplied visual references. No preset palette, person, outfit, layout, mockup or decorative object. ${person} Depict only known product attributes; for unknown form/interface use abstract editorial graphics, never invent a screen or package. Preserve bundle structure as a bundle. ${prior}`,
  };
}
