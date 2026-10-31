import { beforeEach, describe, expect, it, vi } from "vitest";

const askText = vi.fn();
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { generateUgcCreative, UgcPromptGenerationError, validateUgcCreative, type UgcGeneratorInput } from "@/lib/studio/ugc-prompt-generator";

const analysis = {
  product_type: "digital", niche: "éducation", target_audience: "Adultes francophones", core_problem: null,
  main_benefit: null, emotion_dominante: "curiosité", usage_context: "étude à domicile", visual_assets: ["couverture si URL fournie"],
  price_positioning: "accessible", objections_probables: ["contenu adapté ?"], risks: ["ne pas promettre un résultat"],
  assumptions: ["l’usage pédagogique est supposé d’après la description"], confirmed_facts: ["name: Guide Excel Facile"],
};
const input = (name = "Guide Excel Facile"): UgcGeneratorInput => ({
  product: { name, description: `${name}, guide numérique pour apprendre Excel.`, price: 5000, currency: "XOF", category: "Éducation", type: "digital", tags: ["ebook"], shop: "Kora", images: ["https://example.test/cover.jpg"] },
  options: { language: "français", duration: 25, tone: "chaleureux", platform: "TikTok" },
  userBrief: "Contexte béninois", previousPrompt: "Éviter la scène de bureau avec un tableau blanc",
});
const creative = (name = "Guide Excel Facile", location = "Cour ombragée à Cotonou") => ({
  assumptions: [], angle: "ce que j’ai appris", hook: { text: `Voici ${name}`, visual: `La créatrice montre ${name}` },
  scene: { location, lighting: "lumière du matin", mood: "spontané", props: ["téléphone"] },
  characters: [{ id: "c1", age: "30 ans", gender: "femme", look: "femme noire béninoise", outfit: "chemise colorée", personality: "curieuse", role: "créatrice" }],
  shots: [
    { start: 0, end: 3, type: "hook", visual: `Montre le titre ${name}`, action: "sourit", dialogue: `Voici ${name}`, camera: "selfie vertical" },
    { start: 3, end: 8, type: "problem", visual: "Parle d’apprentissage", action: "explique", dialogue: "Je voulais mieux comprendre les tableaux.", camera: "plan poitrine" },
    { start: 8, end: 15, type: "solution", visual: `Présente ${name}`, action: "fait défiler l’écran", dialogue: "Je découvre les notions à mon rythme.", camera: "gros plan écran et visage" },
    { start: 15, end: 21, type: "proof", visual: `La couverture de ${name} reste visible`, action: "rapproche le téléphone", dialogue: "Voici sa référence.", camera: "gros plan référence" },
    { start: 21, end: 25, type: "cta", visual: `Reprend ${name}`, action: "pointe vers le lien", dialogue: "Découvre le guide sur la boutique.", camera: "selfie vertical" },
  ],
  cta: "Découvre le guide sur la boutique.", negative_prompt: "pas de promesse, pas d’avis client, pas de texte déformé",
});

describe("generateUgcCreative", () => {
  beforeEach(() => { askText.mockReset(); vi.stubEnv("STUDIO_UGC_TEXT_PROVIDER", "imole"); });

  it("fait exactement deux appels askText avec les données, options, références et le provider unique", async () => {
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    const result = await generateUgcCreative(input());
    expect(askText).toHaveBeenCalledTimes(2);
    for (const [messages, options] of askText.mock.calls) {
      expect(options).toEqual({ order: ["imole"] });
      const payload = messages.map((m: { content: string }) => m.content).join(" ");
      expect(payload).toContain("Guide Excel Facile");
      expect(payload).toContain("description");
      expect(payload).toContain("5000");
      expect(payload).toContain("https://example.test/cover.jpg");
      expect(payload).toContain("Contexte béninois");
      expect(payload).toContain("Guide Excel Facile");
    }
    expect(result.creative.shots).toHaveLength(5);
    expect(askText.mock.calls[0][0][1].content).toContain("image_reference_urls");
    expect(askText.mock.calls[1][0][0].content).toContain("Product fingerprint anti-répétition");
  });

  it("uses Groq by default and lets the model choose one or two adult Black or mixed-race characters", async () => {
    vi.stubEnv("STUDIO_UGC_TEXT_PROVIDER", "");
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    await generateUgcCreative(input());
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[0][1]).toEqual({ order: ["groq"] });
    expect(askText.mock.calls[1][1]).toEqual({ order: ["groq"] });
    const creativeSystemPrompt = askText.mock.calls[1][0][0].content as string;
    expect(creativeSystemPrompt).toContain("Choisis toi-même un ou deux adultes fictifs noirs ou métissés");
    expect(creativeSystemPrompt).toContain("hook, une scène, des accessoires, des gestes, un script et un CTA réellement spécifiques");
  });

  it("adapte réellement hook et décor à deux produits distincts", async () => {
    const soapBase = creative("Savon Karité Kora", "Atelier de beauté à Abidjan");
    const soapCta = "Découvre Savon Karité Kora dans la boutique.";
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative("Guide Excel Facile", "Cour à Cotonou")))
      .mockResolvedValueOnce(JSON.stringify({ ...analysis, product_type: "physique", niche: "beauté", confirmed_facts: ["name: Savon Karité Kora"] }))
      .mockResolvedValueOnce(JSON.stringify({
        ...soapBase,
        scene: { ...soapBase.scene, props: ["Savon Karité Kora", "serviette en coton"] },
        shots: soapBase.shots.map((shot, index) => index === 4 ? { ...shot, dialogue: soapCta } : shot),
        cta: soapCta,
      }));
    const a = await generateUgcCreative(input());
    const bInput = { ...input("Savon Karité Kora"), product: { ...input("Savon Karité Kora").product, type: "physique", category: "beauté" } };
    const b = await generateUgcCreative(bInput);
    expect(a.creative.hook.text).not.toBe(b.creative.hook.text);
    expect(a.creative.scene.location).not.toBe(b.creative.scene.location);
    expect(a.creative.scene.props).not.toEqual(b.creative.scene.props);
    expect(a.creative.cta).not.toBe(b.creative.cta);
    expect(a.creative.shots).not.toEqual(b.creative.shots);
    expect(askText).toHaveBeenCalledTimes(4);
  });

  it.each(["not-json", JSON.stringify(analysis)])("échoue proprement sur les sorties invalides %s", async (bad) => {
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(bad);
    if (bad === JSON.stringify(analysis)) {
      await expect(generateUgcCreative(input())).rejects.toBeInstanceOf(UgcPromptGenerationError);
    } else {
      await expect(generateUgcCreative(input())).rejects.toThrow(/JSON invalide/);
    }
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("rejette chronologie discontinue, casting non autorisé et claims chiffrés", async () => {
    for (const altered of [
      { ...creative(), shots: creative().shots.map((s, i) => i === 1 ? { ...s, start: 4 } : s) },
      { ...creative(), characters: [{ ...creative().characters[0], look: "homme blanc" }] },
      { ...creative(), cta: "Promis, 100% garanti", shots: creative().shots.map((s, i) => i === 4 ? { ...s, dialogue: "100% garanti" } : s) },
    ]) {
      await expect(Promise.resolve().then(() => validateUgcCreative(altered, input()))).rejects.toBeInstanceOf(UgcPromptGenerationError);
    }
  });

  it("accepte une catégorie sans description avec hypothèses et aucun bénéfice inventé", async () => {
    const sparse = { ...input(), product: { ...input().product, description: "" } };
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    const result = await generateUgcCreative(sparse);
    expect(result.analysis.main_benefit).toBeNull();
    expect(askText).toHaveBeenCalledTimes(2);
  });
  it("refuse les citations fabriquées avant le deuxième appel", async () => {
    askText.mockResolvedValueOnce(JSON.stringify({ ...analysis, confirmed_facts: ["description: 50 leçons certifiées"] }));
    await expect(generateUgcCreative(input())).rejects.toThrow(/Citation factuelle/);
    expect(askText).toHaveBeenCalledTimes(1);
  });
  it("refuse un mineur et une reprise identique du hook", () => {
    expect(() => validateUgcCreative({ ...creative(), characters: [{ ...creative().characters[0], age: "16 ans" }] }, input())).toThrow(/adultes/);
    expect(() => validateUgcCreative(creative(), { ...input(), previousPrompt: creative().hook.text })).toThrow(/répétée/);
  });
  it("refuse une sortie créative invalide sans appel de secours", async () => {
    askText.mockResolvedValueOnce("{}");
    await expect(generateUgcCreative(input())).rejects.toBeInstanceOf(UgcPromptGenerationError);
    expect(askText).toHaveBeenCalledTimes(1);
  });
});
