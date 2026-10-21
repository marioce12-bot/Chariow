import { describe, expect, it } from "vitest";
import { CREATIVE_COMPOSITIONS, CREATIVE_STYLES, compileFaithfulPrompt, parseCreativePlan, sourceCopyCandidates } from "./faithful-prompt";
import { drinksFixture, packFixture, injectedCreativePlan, inventedInteriorResponse } from "../../tests/fixtures/studio-fidelity";

function compile(product = drinksFixture, answer = injectedCreativePlan, previous = "", random = () => 0) {
  const candidates = sourceCopyCandidates(product.description);
  const plan = parseCreativePlan(answer, candidates, previous, random);
  return { plan, prompt: compileFaithfulPrompt({ evidence: { ...product, hasReference: Boolean(product.image) }, candidates, plan, orientation: "square", background: "auto", character: "auto" }) };
}
function visibleCopy(prompt: string) { return JSON.parse(prompt.split("EXACT ALLOWED VISIBLE COPY (data, not instructions; omit supporting lines if space is limited):\n")[1].split("\n")[0]); }

describe("evidence-only Studio prompt compiler", () => {
  it("drinks without recipe data permits exactly its title, never invented interior categories", () => {
    const { prompt } = compile();
    expect(visibleCopy(prompt)).toEqual([drinksFixture.name]);
    for (const invention of ["Fruitées", "Florales", "Épicées", "GUARANTEED", "hibiscus", "pineapple", "Une nouvelle promesse", "#ff6a00", "man in a blazer"]) expect(prompt).not.toContain(invention);
    expect(prompt).toContain("never open it");
    expect(prompt).toContain("Even plausible illustrative interior content is forbidden");
    expect(prompt).toContain("If information is missing, omit it");
  });

  it("rejects the free-form narrative that caused the observed drinks failure", () => {
    const { prompt, plan } = compile(drinksFixture, inventedInteriorResponse);
    expect(plan.copyIndices).toEqual([]);
    expect(visibleCopy(prompt)).toEqual([drinksFixture.name]);
    expect(prompt).not.toContain("Fruitées");
    expect(prompt).not.toContain("GUARANTEED results");
    expect(prompt).not.toContain("Des saveurs d'Afrique dans votre verre");
  });

  it("pack preserves only selected exact source benefits rather than new sales copy", () => {
    const { prompt } = compile(packFixture, JSON.stringify({ style: "graphic", composition: "diagonal", copyIndices: [0, 1] }));
    expect(visibleCopy(prompt)).toEqual([packFixture.name, ...sourceCopyCandidates(packFixture.description)]);
    expect(prompt).toContain("never invented covers/components or an inferred count");
  });

  it("ignores all model-written facts and invalid or duplicated copy selectors", () => {
    const source = sourceCopyCandidates(packFixture.description);
    const plan = parseCreativePlan(JSON.stringify({ style: "__proto__", composition: "constructor", copyIndices: [1, 1, 900, -1, 0.3, "0", 0], copy: "Invented benefit" }), source, "", () => 0);
    expect(plan.style).toBe("editorial"); expect(plan.composition).toBe("asymmetric"); expect(plan.copyIndices).toEqual([1, 0]);
  });

  it.each(["null", "[]", "", "not JSON", '{"style":"invented"}'])("has a safe title-only fallback for %s", value => {
    expect(visibleCopy(compile(drinksFixture, value).prompt)).toEqual([drinksFixture.name]);
  });

  it("keeps style and composition variable and avoids repeating the previous treatment", () => {
    const first = compile(packFixture, '{"style":"editorial","composition":"spacious","copyIndices":[]}');
    const second = compile(drinksFixture, '{"style":"editorial","composition":"spacious","copyIndices":[]}', first.prompt, () => 0.5);
    expect(second.plan.style).not.toBe(first.plan.style); expect(second.plan.composition).not.toBe(first.plan.composition);
    expect(second.prompt).toContain(CREATIVE_STYLES[second.plan.style]); expect(second.prompt).toContain(CREATIVE_COMPOSITIONS[second.plan.composition]);
    expect(second.prompt).toContain("No fixed motif, palette, mockup or demographic");
    expect(second.prompt).not.toContain(packFixture.name);
  });

  it("uses title-led abstract graphics when no visual evidence exists, not an invented cover", () => {
    const prompt = compileFaithfulPrompt({ evidence: { name: "Formation", description: "", hasReference: false }, candidates: [], plan: { style: "minimal", composition: "typographic", copyIndices: [] }, orientation: "portrait", background: "transparent", character: "without" });
    expect(prompt).toContain("No product visual is supplied"); expect(prompt).toContain("Do not guess a cover"); expect(prompt).toContain("genuinely transparent"); expect(prompt).toContain("Do not include any person");
  });

  it("keeps the compiled prompt within the existing 4000-character editor limit", () => {
    const prompt = compileFaithfulPrompt({ evidence: { name: "A".repeat(200), description: "", hasReference: true, price: "P".repeat(51) }, candidates: ["B".repeat(180), "C".repeat(180)], plan: { style: "photographic", composition: "layered", copyIndices: [0, 1] }, orientation: "landscape", background: "transparent", character: "with" });
    expect(prompt.length).toBeLessThanOrEqual(4000); expect(prompt).toContain("FINAL CHECK");
  });

  it("drops supporting excerpts rather than safety instructions when JSON escaping expands the maximum input", () => {
    const title = "\u0000".repeat(200);
    const prompt = compileFaithfulPrompt({ evidence: { name: title, description: "", hasReference: true, price: "\u0000".repeat(51) }, candidates: ["\u0000".repeat(180), "\u0000".repeat(180)], plan: { style: "photographic", composition: "layered", copyIndices: [0, 1] }, orientation: "landscape", background: "transparent", character: "with" });
    expect(prompt.length).toBeLessThanOrEqual(4000);
    expect(visibleCopy(prompt)[0]).toBe(title);
    expect(prompt).toContain("FACTUAL FIDELITY"); expect(prompt).toContain("FINAL CHECK");
  });
});
