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
  beforeEach(() => { askText.mockReset(); vi.stubEnv("STUDIO_UGC_TEXT_PROVIDER", "groq"); });

  it("fait exactement deux appels askText avec les données, options, références et le provider unique", async () => {
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    const result = await generateUgcCreative(input());
    expect(askText).toHaveBeenCalledTimes(2);
    for (const [messages, options] of askText.mock.calls) {
      expect(options.order).toEqual(["openrouter"]);
      expect(options.responseSchema).toBeDefined();
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

  it("uses OpenRouter and lets the model choose one or two adult Black or mixed-race characters", async () => {
    vi.stubEnv("STUDIO_UGC_TEXT_PROVIDER", "");
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    await generateUgcCreative(input());
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[0][1].order).toEqual(["openrouter"]);
    expect(askText.mock.calls[1][1].order).toEqual(["openrouter"]);
    expect(askText.mock.calls[0][1].responseSchema.name).toBe("ugc_product_analysis");
    expect(askText.mock.calls[1][1].responseSchema.name).toBe("ugc_creative_direction");
    const creativeSystemPrompt = askText.mock.calls[1][0][0].content as string;
    expect(creativeSystemPrompt).toContain("Choisis toi-même un ou deux adultes fictifs noirs ou métissés");
    expect(creativeSystemPrompt).toContain("Dans chaque characters[].look, commence par un marqueur positif explicite");
    expect(askText.mock.calls[1][1].responseSchema.schema.properties.characters.items.properties.look.description).toContain("marqueur positif explicite");
    expect(creativeSystemPrompt).toContain("hook, une scène, des accessoires, des gestes, un script et un CTA réellement spécifiques");
    expect(creativeSystemPrompt).toContain("leur phrase doit être prononcée mot pour mot une seule fois dans le dialogue du premier plan (hook.text) et du dernier plan (cta)");
    expect(creativeSystemPrompt).not.toContain("Ne pas répéter le hook/CTA dans les plans et champs séparés");
  });

  it("accepts valid JSON wrapped in Markdown fences while keeping exactly two LLM calls", async () => {
    askText.mockResolvedValueOnce(`\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``)
      .mockResolvedValueOnce(`\`\`\`json\n${JSON.stringify(creative())}\n\`\`\``);
    const result = await generateUgcCreative(input());
    expect(result.creative.shots).toHaveLength(5);
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("tags provider failures by stage without exposing provider details", async () => {
    askText.mockRejectedValueOnce(new Error("private provider response"));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "product_analysis_provider",
      message: "Le fournisseur texte a échoué pendant la préparation UGC.",
    });
    expect(askText).toHaveBeenCalledTimes(1);
  });

  it("asks for a 35-word target and clearly rejects exactly 47 words without truncation or a third call", async () => {
    const overlong = creative();
    const mandatoryWords = `${overlong.hook.text} ${overlong.cta}`.trim().split(/\s+/).length;
    const fillers = 47 - mandatoryWords;
    const baseMiddleCount = Math.floor(fillers / 3);
    const perMiddleShot = [baseMiddleCount, baseMiddleCount, fillers - 2 * baseMiddleCount];
    overlong.shots = overlong.shots.map((shot, index) => ({
      ...shot,
      dialogue: index === 0 ? overlong.hook.text : index === 4 ? overlong.cta : Array(perMiddleShot[index - 1]).fill("mot").join(" "),
    }));
    expect(overlong.shots.map(shot => shot.dialogue.trim()).join(" ").split(/\s+/)).toHaveLength(47);
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(overlong));

    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "creative_direction_validation",
      details: { type: "dialogue_word_budget", path: "shots", expected: "<= 45 mots", received: "47 mots" },
      message: expect.stringContaining("47 mots, limite stricte 45"),
    });

    expect(askText).toHaveBeenCalledTimes(2);
    const creativePrompt = askText.mock.calls[1][0].map((message: { content: string }) => message.content).join(" ");
    expect(creativePrompt).toContain("vise au plus 35 mots");
    expect(creativePrompt).toContain("idéalement 30–32");
  });

  it("classifies OpenRouter 429 and Retry-After without retrying the provider", async () => {
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429, retryAfter: "60" }));

    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "creative_direction_provider",
      details: { type: "provider_rate_limited", httpStatus: 429, retryAfter: "60" },
    });

    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[1][1].order).toEqual(["openrouter"]);
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

  it("reconnaît les identités explicites dans look sans les inférer depuis gender", () => {
    const base = creative();
    for (const look of [
      "Personnage noir ou métissé, apparence naturelle",
      "Afro-descendante, peau brune et cheveux naturels",
      "Mixed-race woman with natural hair",
      "Femme métissée au teint brun",
    ]) {
      expect(() => validateUgcCreative({ ...base, characters: [{ ...base.characters[0], look }] }, input())).not.toThrow();
    }
    expect(() => validateUgcCreative({
      ...base,
      characters: [{ ...base.characters[0], look: "peau foncée, cheveux naturels", gender: "Black woman" }],
    }, input())).toThrow(/marqueur positif noir ou métissé doit figurer explicitement dans look/);
    expect(() => validateUgcCreative({
      ...base,
      characters: [{ ...base.characters[0], look: "not a Black person", gender: "femme" }],
    }, input())).toThrow(/marqueur positif noir ou métissé doit figurer explicitement dans look/);
  });

  it("accepte une catégorie sans description avec hypothèses et aucun bénéfice inventé", async () => {
    const sparse = { ...input(), product: { ...input().product, description: "" } };
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative()));
    const result = await generateUgcCreative(sparse);
    expect(result.analysis.main_benefit).toBeNull();
    expect(askText).toHaveBeenCalledTimes(2);
  });
  it("normalise les champs d’analyse non critiques mais conserve les types critiques", async () => {
    const tolerant = {
      ...analysis, core_problem: 42, main_benefit: {}, emotion_dominante: [], usage_context: null,
      visual_assets: "couverture fournie", risks: null, assumptions: ["indice fourni", 7],
    };
    askText.mockResolvedValueOnce(JSON.stringify(tolerant)).mockResolvedValueOnce(JSON.stringify(creative()));
    const result = await generateUgcCreative(input());
    expect(result.analysis).toMatchObject({
      core_problem: null, main_benefit: null, emotion_dominante: "non précisée", usage_context: "non précisé",
      visual_assets: ["couverture fournie"], risks: [], assumptions: ["indice fourni"],
    });
    expect(askText).toHaveBeenCalledTimes(2);
  });
  it("rejette avant tout appel modèle un produit sans description ni métadonnée de contexte", async () => {
    const sparse = { ...input(), product: { ...input().product, description: "", category: "", type: "", tags: [] } };
    await expect(generateUgcCreative(sparse)).rejects.toMatchObject({
      stage: "input", details: { type: "missing_product_info", missingFields: ["product.description", "product.category", "product.type", "product.tags"] },
    });
    expect(askText).not.toHaveBeenCalled();
  });
  it("refuse les citations fabriquées avant le deuxième appel", async () => {
    askText.mockResolvedValueOnce(JSON.stringify({ ...analysis, confirmed_facts: ["description: 50 leçons certifiées"] }));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "product_analysis_validation",
      details: { path: "confirmed_facts[0]", type: "unsupported_fact" },
    });
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
