import { describe, expect, it } from "vitest";
import { validateUgcPrompt } from "@/lib/studio/ugc-prompt-generator";
import { compileUgcPrompt, compileUgcProviderPlan, extractUgcNarrative } from "@/lib/studio/ugc-provider-assembler";
import { parentingInput, parentingNarrative } from "./fixtures/ugc-parenting";
import { detailedParentingNarrative } from "./fixtures/ugc-parenting-detailed";

const evidence = (prompt: string): string => JSON.parse(prompt.split("\n").find(line => line.startsWith("SOURCE: "))!.slice("SOURCE: ".length)).description;

// Boolean/length assertions deliberately avoid printing source data on failure.
describe("UGC 30-second synthetic product text budget", () => {
  it("accepts sourced page and day counts before assembly", () => {
    expect(() => validateUgcPrompt(parentingNarrative, parentingInput)).not.toThrow();
    expect(() => validateUgcPrompt(detailedParentingNarrative, parentingInput)).not.toThrow();
    expect(parentingInput.product.description.includes("65 pages")).toBe(true);
    expect(parentingInput.product.description.includes("30 jours")).toBe(true);
  });

  it.each([parentingNarrative, detailedParentingNarrative].map((narrative, index) => ({ narrative, index })))("assembles valid six-beat variant $index within both budgets", ({ narrative }) => {
    let failure: string | null = null;
    let prompt = "";
    let segments: { prompt: string }[] = [];
    try {
      prompt = compileUgcPrompt(parentingInput, narrative);
      segments = compileUgcProviderPlan(parentingInput, narrative).segments;
    } catch (error) {
      failure = error instanceof Error ? error.name : "unknown";
    }
    expect(failure).toBeNull();
    expect(prompt.length).toBeLessThanOrEqual(4000);
    expect(segments).toHaveLength(2);
    expect(segments.every(segment => Array.from(segment.prompt).length <= 3600)).toBe(true);
    expect(extractUgcNarrative(prompt) === narrative).toBe(true);
    expect(evidence(prompt).includes("65 pages")).toBe(true);
    expect(evidence(prompt).includes("30 jours")).toBe(true);
    expect(evidence(segments[0].prompt).includes("65 pages")).toBe(true);
    expect(evidence(segments[1].prompt).includes("30 jours")).toBe(true);
    expect(evidence(segments[1].prompt).includes("poser des limites sans humiliation ni violence")).toBe(true);
    for (const compiled of [prompt, ...segments.map(segment => segment.prompt)]) {
      const excerpt = evidence(compiled);
      expect(excerpt.length).toBeGreaterThan(200);
      expect(excerpt.split(/(?<=[.!?])\s+/u).every(sentence => parentingInput.product.description.includes(sentence))).toBe(true);
    }
  });
});
