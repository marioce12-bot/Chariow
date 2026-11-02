export type UgcSpokenLanguage = "fr" | "en";

export function ugcWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Spoken copy is deliberately code-generated: it contains no product claims,
 * and the full product name is used only when the complete script fits.
 */
export function deterministicUgcDialogue(
  duration: number,
  language: UgcSpokenLanguage,
  productName: string,
  lineCount: 4 | 5,
): string[] {
  const english = language === "en";
  const setup = lineCount === 5
    ? english
      ? ["A new discovery.", "I take a moment.", "I look at the reference.", "I continue."]
      : ["Une nouvelle découverte.", "Je prends un instant.", "Je regarde la référence.", "Je continue."]
    : english
      ? ["A discovery.", "I take a look.", "Here is the reference."]
      : ["Une découverte.", "Je regarde.", "Voici la référence."];
  const name = productName.trim();
  const namedCta = english ? `Discover ${name} in the shop.` : `Découvre ${name} dans la boutique.`;
  const neutralCta = english ? "Discover the product in the shop." : "Découvre le produit en boutique.";
  const maxWords = Math.floor(duration * 1.8);
  const cta = ugcWordCount([...setup, namedCta].join(" ")) <= maxWords ? namedCta : neutralCta;
  return [...setup, cta];
}
