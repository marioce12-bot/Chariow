/** Retouching instructions may be written in the UI language, not the creative's language. */
export function buildImageEditInstruction(instruction: string): string {
  return `${instruction}\n\nLANGUAGE AND FACTUAL FIDELITY: Preserve the original language and exact wording of all existing product text. The language of these editing instructions is not a request to translate the creative. Do not add or translate text, claims, benefits, prices or product details unless the user explicitly requests that exact textual change. Preserve the real product identity and do not invent unseen contents.`;
}
