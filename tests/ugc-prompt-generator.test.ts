import { beforeEach, describe, expect, it, vi } from "vitest";

const askText = vi.fn();
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { generateUgcCreative, UgcPromptGenerationError, validateUgcCreative, type UgcGeneratorInput } from "@/lib/studio/ugc-prompt-generator";
import { representativeUgcProducts } from "@/tests/fixtures/ugc-products";

const analysis = {
  product_type: "digital", niche: "guide pratique", target_audience: "Adultes francophones", core_problem: null,
  main_benefit: null, emotion_dominante: "curiosité", usage_context: "consultation sur téléphone", visual_assets: ["couverture si URL fournie"],
  price_positioning: "accessible", objections_probables: ["contenu adapté ?"], risks: ["ne pas promettre un résultat"],
  assumptions: [], confirmed_fact_ids: [0],
};
const input = (name = "Guide Excel Facile", duration = 25): UgcGeneratorInput => ({
  product: { name, description: `${name}, guide numérique pour apprendre Excel.`, price: 5000, currency: "XOF", category: "Éducation", type: "digital", tags: ["ebook"], shop: "Kora", images: ["https://example.test/cover.jpg"] },
  options: { language: "français", duration, tone: "chaleureux", platform: "TikTok" },
  userBrief: "Contexte béninois", previousPrompt: "Éviter la scène de bureau avec un tableau blanc",
});
const draft = (overrides: Record<string, unknown> = {}) => ({
  angle: "Découverte quotidienne",
  hook: { text: "Excel, ça t'intéresse ?", visual: "La présentatrice ouvre son téléphone." },
  scene: { location: "Cour ombragée à Cotonou", lighting: "lumière du matin", mood: "spontané", props: ["téléphone"] },
  characters: [{ id: "creator", age: "30", gender: "femme", look: "noire adulte aux cheveux courts", outfit: "tenue quotidienne sobre", personality: "naturelle et attentive", role: "présentatrice fictive" }],
  shortLines: ["Tu cherches un guide ?", "Ce guide numérique porte sur Excel.", "Tous les détails en boutique."],
  ...overrides,
});
const runGeneration = (creative = draft()) => {
  askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(creative));
  return generateUgcCreative(input());
};
const timing = (duration: number) => validateUgcCreative(draft(), input("Guide Excel Facile", duration)).shots;

beforeEach(() => { askText.mockReset(); vi.stubEnv("STUDIO_UGC_TEXT_PROVIDER", "groq"); });

describe("génération créative UGC", () => {
  it("demande au modèle l’angle, le hook, la scène, le casting et trois répliques courtes", async () => {
    const result = await runGeneration();
    expect(askText).toHaveBeenCalledTimes(2);
    for (const [messages, options] of askText.mock.calls) {
      expect(options.order).toEqual(["openrouter"]);
      expect(options.model).toBe("google/gemini-2.5-flash-lite");
    }
    const creativeCall = askText.mock.calls[1];
    expect(creativeCall[1].responseSchema.name).toBe("ugc_creative_direction");
    expect(Object.keys(creativeCall[1].responseSchema.schema.properties)).toEqual(["angle", "hook", "scene", "characters", "shortLines"]);
    expect(creativeCall[1].responseSchema.schema.properties).not.toHaveProperty("shots");
    expect(creativeCall[1].responseSchema.schema.properties).not.toHaveProperty("cta");
    expect(creativeCall[0][0].content).toContain("le serveur les construit");
    expect(creativeCall[0][0].content).toContain("Choisis toi-même un ou deux adultes fictifs noirs ou métissés");
    expect(creativeCall[0][0].content).toContain("sont des paroles réellement prononcées");
    expect(creativeCall[0][0].content).not.toContain("remplacera entièrement le dialogue");
    expect(result.creative.characters).toEqual(draft().characters);
    expect(result.creative.shots.map(shot => shot.type)).toEqual(["hook", "problem", "solution", "proof", "cta"]);
    expect(result.creative.shots.slice(0, 4).map(shot => shot.dialogue)).toEqual([draft().hook.text, ...draft().shortLines]);
    expect(result.creative.cta).toBe("Découvre Guide Excel Facile dans la boutique.");
  });

  it.each([
    [{ ...draft().characters[0], age: "17" }, "personnages adultes uniquement"],
    [{ ...draft().characters[0], look: "adulte à la peau brune" }, "marqueur positif"],
    [{ ...draft().characters[0], role: "présentatrice" }, "fictif"],
  ])("rejette un casting qui ne respecte pas les contraintes d’adulte, d’identité et de fiction", (character, expected) => {
    expect(() => validateUgcCreative(draft({ characters: [character] }), input())).toThrow(expected);
  });

  it("conserve deux personnages fictifs choisis par le modèle", () => {
    const characters = [
      ...draft().characters,
      { id: "guest", age: "42", gender: "homme", look: "métis adulte aux cheveux bouclés", outfit: "chemise légère", personality: "calme", role: "invité fictif" },
    ];
    const result = validateUgcCreative(draft({ characters }), input());
    expect(result.characters).toEqual(characters);
    expect(result.shots[0].action).toContain("Les personnages fictifs ouvrent");
  });

  it("n’interprète pas un identifiant de personnage numérique comme une affirmation produit", () => {
    const character = { ...draft().characters[0], id: "c1" };
    const result = validateUgcCreative(draft({ characters: [character] }), input());
    expect(result.characters[0].id).toBe("c1");
  });

  it.each([15, 20, 25, 30])("construit cinq plans contigus pour une vidéo de %i secondes", duration => {
    const shots = timing(duration);
    expect(shots).toHaveLength(5);
    expect(shots[0].start).toBe(0);
    expect(shots[4].end).toBe(duration);
    expect(shots[4].end - shots[4].start).toBeGreaterThanOrEqual(3);
    expect(shots[4].end - shots[4].start).toBeLessThanOrEqual(5);
    for (let i = 1; i < shots.length; i++) expect(shots[i].start).toBe(shots[i - 1].end);
  });

  it.each([15, 20, 30])("conserve le dialogue publicitaire sous le plafond pour une vidéo de %i secondes", duration => {
    const result = validateUgcCreative(draft({
      hook: { text: "Excel, ça t'intéresse ?", visual: "La présentatrice ouvre son téléphone." },
      shortLines: ["Tu cherches un guide ?", "Guide numérique sur Excel.", "Voir les détails en boutique."],
    }), input("Guide Excel Facile", duration));
    const spoken = result.shots.map(shot => shot.dialogue).join(" ");
    expect(spoken.trim().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(Math.floor(duration * 1.8));
    expect(result.shots).toHaveLength(5);
  });

  it("insère toujours le nom exact du produit dans les plans et le CTA, même si le modèle l’omet", () => {
    const result = validateUgcCreative(draft(), input("Nom Exact Boutique"));
    expect(result.shots[2].visual).toContain("Nom Exact Boutique");
    expect(result.shots[3].action).toContain("Nom Exact Boutique");
    expect(result.shots[4].dialogue).toContain("Nom Exact Boutique");
    expect(result.shots[4].dialogue).toBe(result.cta);
    expect(result.shots[4].type).toBe("cta");
  });

  it("préserve un nom produit long sans le tronquer et utilise un CTA de repli borné", () => {
    const productName = "Guide international pratique pour la maîtrise complète des tableaux de données Excel";
    const result = validateUgcCreative(draft(), input(productName, 15));
    const spoken = result.shots.map(shot => shot.dialogue).join(" ");
    expect(result.shots[2].visual).toContain(productName);
    expect(result.shots[2].action).toContain(productName);
    expect(result.cta).not.toContain(productName);
    expect(spoken.trim().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(27);
  });

  it("construit aussi les champs automatiques en anglais quand la fiche est en anglais", () => {
    const englishInput = { ...input("Exact Product Name"), options: { ...input().options, language: "English" } };
    const result = validateUgcCreative(draft(), englishInput);
    expect(result.cta).toBe("Discover Exact Product Name in the shop.");
    expect(result.shots[0].action).toContain("The fictional character");
    expect(result.negative_prompt).toContain("no unverified facts");
  });

  it("refuse les répliques qui dépassent le temps de parole plutôt que de les remplacer par du remplissage", async () => {
    const overlong = draft({
      hook: { text: "mot ".repeat(13), visual: "La présentatrice ouvre son téléphone." },
      shortLines: ["ligne ".repeat(13), "autre ".repeat(13), "texte ".repeat(13)],
    });
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(overlong));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "creative_direction_validation", details: { type: "dialogue_too_long" },
    });
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it.each(["Une nouvelle découverte.", "Je prends un instant.", "Je regarde la référence.", "Je continue."])("rejette l’ancienne réplique de remplissage %s", async filler => {
    const candidate = draft({ shortLines: [filler, draft().shortLines[1], draft().shortLines[2]] });
    await expect(runGeneration(candidate)).rejects.toMatchObject({
      stage: "creative_direction_validation", details: { type: "generic_filler" },
    });
  });

  it("prononce un mini-scénario naturel qui reprend seulement les faits confirmés du pack", async () => {
    const name = "Pack spécial Promo développement";
    const description = "Le pack réunit quatre guides : vidéos IA, audience LinkedIn, création SaaS et comptabilité avec l'IA. L'accès au pack est disponible après paiement.";
    const packInput: UgcGeneratorInput = {
      ...input(name, 30),
      product: { ...input(name, 30).product, description },
    };
    const packAnalysis = { ...analysis, confirmed_fact_ids: [0, 1, 2] };
    const packDraft = draft({
      hook: { text: "Tu développes un projet et tu veux explorer plusieurs sujets ?", visual: "La présentatrice tient la fiche du pack sur son téléphone." },
      shortLines: [
        "Tu cherches des ressources autour du numérique ?",
        "Le pack réunit quatre guides : vidéos IA, audience LinkedIn, création SaaS et comptabilité avec l'IA.",
        "L'accès au pack est disponible après paiement.",
      ],
    });
    askText.mockResolvedValueOnce(JSON.stringify(packAnalysis)).mockResolvedValueOnce(JSON.stringify(packDraft));

    const result = await generateUgcCreative(packInput);
    const spoken = result.creative.shots.map(shot => shot.dialogue).join(" ");
    const creativeRequest = JSON.parse(askText.mock.calls[1][0][1].content);

    expect(creativeRequest.analysis.confirmed_facts).toEqual([
      `name: ${name}`,
      `description: ${description.split(". ")[0]}.`,
      `description: ${description.split(". ")[1]}`,
    ]);
    expect(result.creative.shots.slice(0, 4).map(shot => shot.dialogue)).toEqual([packDraft.hook.text, ...packDraft.shortLines]);
    expect(spoken).toContain("quatre guides : vidéos IA, audience LinkedIn, création SaaS et comptabilité avec l'IA");
    expect(spoken).toContain("L'accès au pack est disponible après paiement.");
    expect(spoken).toContain(result.creative.cta);
    expect(spoken).not.toMatch(/Une nouvelle découverte|Je prends un instant|Je regarde la référence|Je continue/i);
  });

  it("corrige un hook répété en ne demandant que hookText", async () => {
    const repeated = draft();
    const previousPrompt = `Ancien prompt : ${repeated.hook.text}`;
    askText.mockResolvedValueOnce(JSON.stringify(analysis))
      .mockResolvedValueOnce(JSON.stringify(repeated))
      .mockResolvedValueOnce(JSON.stringify({ hookText: "Un nouveau regard sur ce guide." }));
    const result = await generateUgcCreative({ ...input(), previousPrompt });
    expect(askText).toHaveBeenCalledTimes(3);
    expect(askText.mock.calls[2][1].responseSchema.name).toBe("ugc_hook_correction");
    expect(Object.keys(askText.mock.calls[2][1].responseSchema.schema.properties)).toEqual(["hookText"]);
    expect(result.creative.hook.text).toBe(result.creative.shots[0].dialogue);
    expect(result.creative.hook.visual).toBe(repeated.hook.visual);
    expect(result.creative.scene).toEqual(repeated.scene);
  });

  it("corrige un hook répété mais ne demande plus au modèle de réparer le dialogue", async () => {
    const repeatedOverlong = draft();
    const previousPrompt = `Ancien prompt : ${repeatedOverlong.hook.text}`;
    askText.mockResolvedValueOnce(JSON.stringify(analysis))
      .mockResolvedValueOnce(JSON.stringify(repeatedOverlong))
      .mockResolvedValueOnce(JSON.stringify({ hookText: "Un hook distinct et bref." }));
    const result = await generateUgcCreative({ ...input(), previousPrompt });
    expect(askText).toHaveBeenCalledTimes(3);
    expect(askText.mock.calls[2][1].responseSchema.name).toBe("ugc_hook_correction");
    expect(result.creative.shots).toHaveLength(5);
  });

  it("rejette un chiffre non étayé même lorsqu’il apparaît seul dans le dialogue", () => {
    const unverified = draft({ shortLines: ["Tu veux découvrir Excel ?", "Je note 7 idées.", "Tu peux lire la description dans la boutique."] });
    expect(() => validateUgcCreative(unverified, input())).toThrowError(UgcPromptGenerationError);
    expect(() => validateUgcCreative(unverified, input())).toThrow("affirmation chiffrée absente des données produit");
  });

  it("s’arrête après deux corrections si le hook reste répété", async () => {
    const repeated = draft();
    const previousPrompt = `Ancien prompt : ${repeated.hook.text}`;
    askText.mockResolvedValueOnce(JSON.stringify(analysis))
      .mockResolvedValueOnce(JSON.stringify(repeated))
      .mockResolvedValueOnce(JSON.stringify({ hookText: repeated.hook.text }))
      .mockResolvedValueOnce(JSON.stringify({ hookText: repeated.hook.text }));
    await expect(generateUgcCreative({ ...input(), previousPrompt })).rejects.toMatchObject({
      stage: "creative_direction_validation", details: { type: "duplicate_hook", path: "hook.text" },
    });
    expect(askText).toHaveBeenCalledTimes(4);
  });

  it("rejette les promesses, bénéfices et chiffres non étayés sans demander au modèle de les sauver", async () => {
    const unverified = draft({ shortLines: ["Cette méthode garantit 10 000 XOF de revenus.", "Ce guide numérique est consacré à Excel.", "Tu peux en découvrir les détails dans la boutique."] });
    askText.mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify(unverified));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "creative_direction_validation", details: { type: "unsupported_claim" },
    });
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("bloque une affirmation non vérifiée dans le dialogue brut même si ce texte sera remplacé", async () => {
    const overlong = draft({ shortLines: ["mot ".repeat(20), "phrase ".repeat(20), "texte ".repeat(20)] });
    askText.mockResolvedValueOnce(JSON.stringify(analysis))
      .mockResolvedValueOnce(JSON.stringify({ ...overlong, shortLines: ["Cette méthode garantit un résultat.", "Ce guide numérique est consacré à Excel.", "Tu peux en découvrir les détails dans la boutique."] }));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "creative_direction_validation", details: { type: "unsupported_claim" },
    });
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("ne relance pas le fournisseur texte après une erreur de génération", async () => {
    askText.mockRejectedValueOnce(Object.assign(new Error("provider failure"), { status: 429, retryAfter: "60" }));
    await expect(generateUgcCreative(input())).rejects.toMatchObject({
      stage: "product_analysis_provider", details: { type: "provider_rate_limited", httpStatus: 429, retryAfter: "60" },
    });
    expect(askText).toHaveBeenCalledTimes(1);
  });

  it("refuse les structures créatives qui réintroduisent des champs de plan fournis par le modèle", () => {
    expect(() => validateUgcCreative({ ...draft(), shots: [] }, input())).toThrow(/champ supplémentaire interdit/);
  });

  it("traite localement toute la chaîne sur sept fixtures de produits représentatifs", async () => {
    askText.mockImplementation(async (messages: Array<{ content: string }>, options: { responseSchema: { name: string } }) => {
      if (options.responseSchema.name === "ugc_product_analysis") return JSON.stringify(analysis);
      const payload = JSON.parse(messages[messages.length - 1].content) as { product: { name: string } };
      return JSON.stringify(draft({
        angle: `Découverte autour de ${payload.product.name}`,
        hook: { text: `Une idée à découvrir, ${payload.product.name} ?`, visual: "La présentatrice ouvre la référence fournie." },
      }));
    });
    const generated = await Promise.all(representativeUgcProducts.map(product => generateUgcCreative({
      product: { ...product, tags: [...product.tags], images: ["https://example.test/fixture-cover.jpg"], shop: "Boutique de test" },
      options: { language: "français", duration: 25, tone: "naturel", platform: "Reels" },
    })));
    expect(generated).toHaveLength(7);
    expect(askText).toHaveBeenCalledTimes(14);
    generated.forEach((result, index) => {
      const name = representativeUgcProducts[index].name;
      expect(result.creative.shots).toHaveLength(5);
      expect(result.creative.shots.map(shot => shot.type)).toEqual(["hook", "problem", "solution", "proof", "cta"]);
      expect(result.creative.shots[2].visual).toContain(name);
      expect(result.creative.shots[4].dialogue).toContain(name);
      expect(result.creative.shots[0].start).toBe(0);
      expect(result.creative.shots[4].end).toBe(25);
      for (let shot = 1; shot < 5; shot++) expect(result.creative.shots[shot].start).toBe(result.creative.shots[shot - 1].end);
    });
  });
});
