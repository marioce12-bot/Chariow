import { describe, expect, it } from "vitest";
import { UgcPromptGenerationError, validateUgcPrompt } from "@/lib/studio/ugc-prompt-generator";
import { parentingInput, parentingNarrative } from "./fixtures/ugc-parenting";

const ruleFor = (prompt: string) => {
  try { validateUgcPrompt(prompt, parentingInput); return null; }
  catch (error) { return error instanceof UgcPromptGenerationError ? error.details.type : "unexpected_error"; }
};

describe("UGC French articles versus numeric claims", () => {
  it("does not count an indefinite article in a negated staging direction as a numeric promise", () => {
    const prompt = parentingNarrative.replace("de résultat obtenu", "un résultat obtenu");
    expect(ruleFor(prompt)).toBeNull();
  });

  it.each(["une solution", "un objectif", "un avantage"])("allows generic abstract article variant %s without inventing a count", phrase => {
    const prompt = `Direction: ne pas représenter ${phrase} comme un résultat acquis.\n${parentingNarrative}`;
    expect(ruleFor(prompt)).toBeNull();
  });

  it.each([
    { label: "explicit digit", phrase: "2 résultats" },
    { label: "explicit word", phrase: "deux résultats" },
    { label: "day", phrase: "un jour" },
    { label: "week", phrase: "une semaine" },
    { label: "page", phrase: "une page" },
  ])("still rejects an unsupported quantity: $label", ({ phrase }) => {
    const prompt = parentingNarrative.replace("des pistes pour mieux écouter", `${phrase} pour mieux écouter`);
    expect(ruleFor(prompt)).toBe("unsupported_numeric_claim");
  });

  it("still rejects an unsupported guarantee independently of an article", () => {
    const prompt = parentingNarrative.replace("des pistes pour mieux écouter", "un résultat garanti pour mieux écouter");
    expect(ruleFor(prompt)).toBe("unsupported_guarantee");
  });
});
