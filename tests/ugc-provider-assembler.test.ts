import { afterEach, describe, expect, it, vi } from "vitest";
import { compileUgcPrompt, compileUgcProviderPlan } from "@/lib/studio/ugc-provider-assembler";
import { normalizeUgcInput } from "@/lib/studio/ugc-prompt-input";
import { signPreparedUgc, readPreparedUgc } from "@/lib/studio/ugc-prepared-plan";
import type { UgcCreativeDirection, UgcProductAnalysis } from "@/lib/studio/ugc-prompt-generator";

const input = normalizeUgcInput({ name: "Ebook Jardin", description: "Disponible au format PDF.", price: 5000, currency: "XOF", category: "Jardin", type: "digital", tags: ["ebook"], image: "https://cdn.example.com/cover.png", shop: "Jardin Kora" }, { duration: 25, language: "fr", tone: "fun", platform: "TikTok" }, "fr");
const creative: UgcCreativeDirection = {
  assumptions: ["Décor de terrasse supposé."], angle: "Découverte", hook: { text: "Voici Ebook Jardin.", visual: "Montre sa couverture." },
  scene: { location: "Terrasse à Cotonou", lighting: "matin", mood: "curieux", props: ["téléphone"] },
  characters: [{ id: "a", age: "32", gender: "femme", look: "noire", outfit: "chemise verte", personality: "curieuse", role: "présentatrice fictive" }],
  shots: [
    { start: 0, end: 3, type: "hook", visual: "Vraie couverture Ebook Jardin", action: "montre le téléphone", dialogue: "Voici Ebook Jardin.", camera: "selfie vertical" },
    { start: 3, end: 8, type: "problem", visual: "Regarde son jardin", action: "désigne les plantes", dialogue: "Envie de découvrir le jardinage ?", camera: "plan poitrine" },
    { start: 8, end: 15, type: "solution", visual: "Couverture exacte", action: "rapproche le téléphone", dialogue: "Ce guide existe au format PDF.", camera: "gros plan produit" },
    { start: 15, end: 21, type: "proof", visual: "Référence réelle lisible", action: "maintient l’écran", dialogue: "Voici sa référence.", camera: "travelling léger vers le téléphone" },
    { start: 21, end: 25, type: "cta", visual: "Visage et référence", action: "regarde le spectateur", dialogue: "Découvre-le sur la boutique.", camera: "selfie" },
  ], cta: "Découvre-le sur la boutique.", negative_prompt: "pas de couverture inventée, pas de faux avis, pas de watermark",
};
const analysis = { product_type: "digital", niche: "jardin", target_audience: "adultes", core_problem: null, main_benefit: null, emotion_dominante: "curiosité", usage_context: "lecture", visual_assets: ["couverture"], price_positioning: "accessible", objections_probables: ["contenu ?"], risks: ["résultat non garanti"], assumptions: [], confirmed_facts: ["name: Ebook Jardin"] } as UgcProductAnalysis;
afterEach(() => vi.unstubAllEnvs());

describe("UGC deterministic provider adapter", () => {
  it("preserves product-specific camera, dialogue and references in exactly 15+10 seconds", () => {
    const prompt = compileUgcPrompt(input, creative);
    expect(prompt).toContain("Terrasse à Cotonou");
    expect(prompt).toContain("chemise verte");
    expect(prompt).toContain("gros plan produit");
    const plan = compileUgcProviderPlan(input, creative);
    expect(plan.segments.map(s => s.duration)).toEqual([15, 10]);
    expect(plan.segments[0].prompt).toContain('SAY VERBATIM: "Ce guide existe au format PDF."');
    expect(plan.segments[1].prompt).toContain("travelling léger");
    expect(plan.segments[1].prompt).not.toContain('SAY VERBATIM: "Voici Ebook Jardin."');
    for (const segment of plan.segments) {
      expect(Array.from(segment.prompt).length).toBeLessThanOrEqual(3600);
      expect(segment.prompt).toContain("exact ebook cover");
    }
    expect(compileUgcPrompt(input, creative)).toBe(prompt);
  });
  it.each([10, 15])("renders %ss as one clip with the final dialogue and CTA in that clip", duration => {
    const shortInput = { ...input, options: { ...input.options, duration } };
    const plan = compileUgcProviderPlan(shortInput, creative);
    expect(plan.duration).toBe(duration);
    expect(plan.segments.map(segment => segment.duration)).toEqual([duration]);
    expect(plan.segments[0].prompt).toContain(`exactly ${duration}s`);
    expect(plan.segments[0].prompt).toContain("FINAL CTA");
    expect(plan.segments[0].prompt).not.toContain("CONTINUITY:");
  });
  it("fails closed on oversized scenarios and unsupported duration values", () => {
    const oversized = { ...creative, negative_prompt: "x".repeat(5000) };
    expect(() => compileUgcPrompt(input, oversized)).toThrow();
    expect(() => compileUgcProviderPlan(input, oversized)).toThrow();
    expect(() => compileUgcProviderPlan({ ...input, options: { ...input.options, duration: 20 } }, creative)).toThrow(/Durée vidéo non prise en charge/);
  });
  it("normalizes real metadata identically for prompt and render requests", () => {
    const renderInput = normalizeUgcInput({ ...input.product, imageUrl: input.product.images?.[0] }, input.options, "fr");
    expect(renderInput.product).toEqual(input.product);
    expect(input.product).toMatchObject({ category: "Jardin", tags: ["ebook"], shop: "Jardin Kora" });
  });
});
describe("prepared UGC integrity", () => {
  it("reuses only the same owner, product, options and unedited prompt", () => {
    vi.stubEnv("STUDIO_UGC_SIGNING_SECRET", "test-only-signing-secret");
    const prompt = compileUgcPrompt(input, creative);
    const token = signPreparedUgc("owner", input, { analysis, creative }, prompt)!;
    expect(readPreparedUgc(token, "owner", input, prompt)?.creative).toEqual(creative);
    expect(readPreparedUgc(token, "other", input, prompt)).toBeNull();
    expect(readPreparedUgc(token, "owner", input, `${prompt} édité`)).toBeNull();
    expect(readPreparedUgc(token + "x", "owner", input, prompt)).toBeNull();
    expect(readPreparedUgc(token, "owner", { ...input, product: { ...input.product, name: "Autre produit" } }, prompt)).toBeNull();
    expect(readPreparedUgc(token, "owner", { ...input, options: { ...input.options, tone: "sérieux" } }, prompt)).toBeNull();
  });
  it("does not reuse an expired token", () => {
    vi.stubEnv("STUDIO_UGC_SIGNING_SECRET", "test-only-signing-secret");
    const prompt = compileUgcPrompt(input, creative);
    const token = signPreparedUgc("owner", input, { analysis, creative }, prompt)!;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    expect(readPreparedUgc(token, "owner", input, prompt)).toBeNull();
    vi.restoreAllMocks();
  });
});
