export type UgcSpokenLanguage = "fr" | "en";

export function ugcWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const GENERIC_FILLER_LINES = new Set([
  "a new discovery",
  "i take a moment",
  "i look at the reference",
  "i continue",
  "a discovery",
  "i take a look",
  "here is the reference",
  "une nouvelle decouverte",
  "je prends un instant",
  "je regarde la reference",
  "je continue",
  "une decouverte",
  "je regarde",
  "voici la reference",
]);

function normalizeDialogueLine(line: string): string {
  return line
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[.!?…]+$/g, "")
    .trim();
}

export function isGenericUgcFillerLine(line: string): boolean {
  return GENERIC_FILLER_LINES.has(normalizeDialogueLine(line));
}

/**
 * Preserve the model-written ad dialogue. Only the final CTA is server-authored,
 * and the named product is kept whenever the full script fits the time budget.
 */
export function buildUgcSpokenDialogue(
  duration: number,
  language: UgcSpokenLanguage,
  productName: string,
  storyLines: [string, string, string, string],
): string[] {
  const english = language === "en";
  const name = productName.trim();
  const namedCta = english ? `Discover ${name} in the shop.` : `Découvre ${name} dans la boutique.`;
  const neutralCta = english ? "Discover the product in the shop." : "Découvre le produit en boutique.";
  const maxWords = Math.floor(duration * 1.8);
  const cta = ugcWordCount([...storyLines, namedCta].join(" ")) <= maxWords ? namedCta : neutralCta;
  return [...storyLines, cta];
}
