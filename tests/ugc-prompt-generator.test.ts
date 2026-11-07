import { beforeEach, describe, expect, it, vi } from "vitest";
const askText = vi.fn();
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { generateUgcPrompt, readUgcTimeline, validateUgcPrompt, UgcPromptGenerationError, UGC_TEXT_MODEL, type UgcGeneratorInput } from "@/lib/studio/ugc-prompt-generator";

const input = (duration = 10, product?: Partial<UgcGeneratorInput["product"]>): UgcGeneratorInput => ({
  product: { name: "Savon Kora", description: "Savon fabriqué artisanalement au Bénin.", content: "Savon doux pour la routine quotidienne.", price: "2500", currency: "XOF", category: "Beauté", images: ["https://cdn.example.com/savon.png"], type: "physique", tags: ["savon", "artisanal"], shop: "Kora", ...product },
  options: { duration, language: "français", tone: "naturel", platform: "Reels", angle: "routine quotidienne" },
  userBrief: "Dans une salle de bain lumineuse, avec une serviette blanche.", previousPrompt: "Ancienne variation à éviter.",
});

const promptFor = (duration: number, options: { title?: string; ebook?: boolean; finalDialogue?: string; finalVisual?: string } = {}) => {
  const title = options.title ?? "Savon Kora";
  const ebook = options.ebook ?? false;
  const bounds = duration === 10 ? [[0, 3], [3, 6.5], [6.5, 10]] : duration === 15 ? [[0, 3.5], [3.5, 7.5], [7.5, 11.5], [11.5, 15]] : duration === 30 ? [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30]] : [[0, 5], [5, 10], [10, 15], [15, 21], [21, 25]];
  const dialogue = duration === 10
    ? ["Tu cherches une idée nouvelle pour ta routine ?", "Je prends le produit et l'observe tranquillement."]
    : duration === 15
      ? ["Tu cherches une idée nouvelle pour ta routine ?", "Je prends le produit et l'observe tranquillement.", "Je le tourne doucement et regarde ses détails en lumière naturelle."]
      : duration === 30
        ? ["Tu cherches une idée pour ta routine sans savoir par où commencer ?", "Je prends le produit et j'observe attentivement sa forme dans la lumière.", "Je le tourne doucement et prends le temps d'observer les détails en lumière naturelle.", "Je choisis un décor simple et garde le produit visible devant la caméra.", "Je termine avec la référence bien visible."]
        : ["Tu cherches une idée pour ta routine sans savoir par où commencer ?", "Je prends le produit et j'observe attentivement sa forme dans la lumière.", "Je le tourne doucement et prends le temps d'observer les détails en lumière naturelle.", "Je choisis un décor simple, rapproche le produit et le garde visible devant la caméra."];
  const final = options.finalDialogue ?? (ebook ? `Appuie sur le bouton pour télécharger ${title} dès maintenant.` : `Appuie sur le bouton pour commander ${title} maintenant.`);
  const allDialogues = [...dialogue, final];
  const defaultVisual = ebook
    ? "ACTION: couverture réelle sur téléphone tenu face caméra, titre et illustration intacts, gros plan net centré"
    : "ACTION: vraie référence du produit tenue face caméra, clairement visible à l'écran";
  const finalVisual = options.finalVisual ?? defaultVisual;
  return `Scénario vidéo UGC — ${duration} secondes\n${bounds.map(([start, end], i) => `${start}–${end}s | ACTION: ${i === bounds.length - 1 ? finalVisual : "une personne présente le produit dans une scène quotidienne"}; CAMÉRA: plan vertical naturel; DIALOGUE EXACT: «${allDialogues[i]}»`).join("\n")}`;
};

const syntheticGuideFixtures = [
  {
    name: "Comment être recommandé pour un emploi",
    description: "Guide pratique pour améliorer sa présentation professionnelle et demander une recommandation. La démarche est structurée en trois étapes de préparation d'une candidature.",
    claim: "Le guide présente 3 étapes pour préparer une candidature.",
  },
  {
    name: "Comment créer une relation avec son enfant",
    description: "Guide pour aider un parent à construire une relation de confiance avec son enfant, avec cinq exercices de dialogue adaptés au quotidien.",
    claim: "Ce guide comprend 5 exercices de dialogue parent-enfant.",
  },
] as const;

const replaceDialogueAt = (prompt: string, index: number, dialogue: string) => {
  let current = 0;
  return prompt.replace(/DIALOGUE EXACT: «[^»]*»/g, match => current++ === index ? `DIALOGUE EXACT: «${dialogue}»` : match);
};

beforeEach(() => askText.mockReset());

describe("générateur UGC texte libre avec règles de durée ciblées", () => {
  it.each([
    { duration: 10, beats: 3, contract: /exactement 3 temps.*plages fixes.*0–3, 3–6\.5, 6\.5–10.*dialogue court et naturel.*appel à l'action final/ },
    { duration: 15, beats: 4, contract: /exactement 4 temps.*plages fixes.*0–3\.5, 3\.5–7\.5, 7\.5–11\.5, 11\.5–15.*dialogue court et naturel.*appel à l'action final/ },
    { duration: 25, beats: 5, contract: /exactement 5 temps.*plages fixes.*0–5, 5–10, 10–15, 15–21, 21–25.*dialogue court et naturel.*appel à l'action final/ },
    { duration: 30, beats: 6, contract: /exactement 6 temps.*plages fixes.*0–5, 5–10, 10–15, 15–20, 20–25, 25–30.*dialogue court et naturel.*appel à l'action final/ },
  ])("respecte le contrat $duration s: $beats temps sans quota de mots", async ({ duration, beats, contract }) => {
    const expected = promptFor(duration);
    askText.mockResolvedValueOnce(expected);
    await expect(generateUgcPrompt(input(duration))).resolves.toBe(expected);
    const entries = readUgcTimeline(expected);
    expect(entries).toHaveLength(beats);
    expect(expected).toMatch(/Appuie sur le bouton pour commander Savon Kora/);
    expect(validateUgcPrompt(expected, input(duration))).toBe(expected);
    expect(askText).toHaveBeenCalledTimes(1);
    const [messages, options] = askText.mock.calls[0];
    expect(options).toMatchObject({ order: ["openrouter"], model: UGC_TEXT_MODEL, timeoutMs: expect.any(Number) });
    expect(options.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(options.responseSchema).toBeUndefined();
    const payload = JSON.parse(messages[1].content);
    expect(payload.product).toMatchObject({ title: "Savon Kora", description: input(duration).product.description, content: input(duration).product.content, hasReferenceImage: true });
    expect(payload.options).toEqual(input(duration).options);
    expect(messages[0].content).toMatch(contract);
    expect(messages[0].content).toMatch(/bénéfices et promesses doivent provenir exclusivement de la description/i);
    expect(messages[0].content).toMatch(/synchronise dans le même temps horodaté/i);
    expect(messages[0].content).toMatch(/appuyer sur le bouton/i);
    expect(messages[0].content).toMatch(/jamais des textes incrustés, sous-titres/i);
    if (duration === 30) expect(messages[0].content).toContain("30 s = 15 s + 15 s");
    expect(expected).not.toMatch(/^\s*\{/);
    if (duration === 25) expect(expected).toMatch(/15–21s/);
    if (duration === 30) expect(readUgcTimeline(expected).map(({ start, end }) => [start, end])).toEqual([[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30]]);
  });

  it("accepte un CTA ebook Télécharger avec couverture réelle sur téléphone", () => {
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const prompt = promptFor(10, { title: ebookInput.product.name, ebook: true });
    expect(validateUgcPrompt(prompt, ebookInput)).toBe(prompt);
    expect(prompt).toMatch(/Appuie sur le bouton pour télécharger Guide Excel Facile/);
    expect(prompt).toMatch(/couverture réelle sur téléphone/);
  });

  it.each(syntheticGuideFixtures)("accepte un chiffre repris des données du guide « $name »", guide => {
    const guideInput = input(30, { name: guide.name, description: guide.description, type: "ebook", category: "Guide pratique" });
    const prompt = replaceDialogueAt(promptFor(30, { title: guide.name, ebook: true }), 2, guide.claim);
    expect(validateUgcPrompt(prompt, guideInput)).toBe(prompt);
  });

  it("rejette toujours un chiffre qui n'est pas dans les données synthétiques du guide emploi", () => {
    const guide = syntheticGuideFixtures[0];
    const guideInput = input(30, { name: guide.name, description: guide.description, type: "ebook", category: "Guide pratique" });
    const prompt = replaceDialogueAt(promptFor(30, { title: guide.name, ebook: true }), 2, "Le guide propose une méthode efficace en 7 jours.");
    let failure: unknown;
    try { validateUgcPrompt(prompt, guideInput); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ stage: "validation", details: { type: "unsupported_numeric_claim", path: "claims.number" } });
  });

  it("rejette un nombre non sourcé écrit en toutes lettres en français", () => {
    const guide = syntheticGuideFixtures[0];
    const guideInput = input(30, { name: guide.name, description: guide.description, type: "ebook", category: "Guide pratique" });
    const prompt = replaceDialogueAt(promptFor(30, { title: guide.name, ebook: true }), 2, "Le guide promet un résultat en sept jours.");
    let failure: unknown;
    try { validateUgcPrompt(prompt, guideInput); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ stage: "validation", details: { type: "unsupported_numeric_claim", path: "claims.number" } });
  });

  it("rejette une quantité non sourcée écrite en anglais dans une action", () => {
    const guide = syntheticGuideFixtures[0];
    const guideInput = input(30, { name: guide.name, description: guide.description, type: "ebook", category: "Guide pratique" });
    const prompt = promptFor(30, { title: guide.name, ebook: true }).replace("ACTION: une personne présente le produit dans une scène quotidienne", "ACTION: illustration de seven days");
    let failure: unknown;
    try { validateUgcPrompt(prompt, guideInput); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ stage: "validation", details: { type: "unsupported_numeric_claim", path: "claims.number" } });
  });

  it("reconnaît les unités anglaises de chronologie tout en conservant la coupure fixe 15 s + 15 s", () => {
    const productInput = input(30);
    const prompt = promptFor(30).split("s |").join(" seconds |");
    expect(readUgcTimeline(prompt).map(({ start, end }) => [start, end])).toEqual([[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30]]);
    expect(validateUgcPrompt(prompt, productInput)).toBe(prompt);
  });

  it("répète les bornes exactes de 30 s lors du retry après une chronologie incomplète", async () => {
    const valid = promptFor(30);
    const incomplete = valid.replace("10–15s", "11–15s");
    askText.mockResolvedValueOnce(incomplete).mockResolvedValueOnce(valid);
    await expect(generateUgcPrompt(input(30))).resolves.toBe(valid);
    expect(askText).toHaveBeenCalledTimes(2);
    const correction = askText.mock.calls[1][0].at(-1).content;
    expect(correction).toContain("0–5, 5–10, 10–15, 15–20, 20–25, 25–30");
    expect(correction).toContain("15 s + 15 s");
    expect(correction).toContain("ne change pas les faits du produit");
  });

  it.each([
    {
      name: "formation",
      product: { name: "Formation Excel Pro", description: "Formation pratique pour apprendre les formules Excel.", type: "formation" },
      finalDialogue: "Appuie sur le bouton pour accéder à Formation Excel Pro.",
    },
    {
      name: "pack numérique",
      product: { name: "Pack Créateur Express", description: "Pack numérique de modèles à personnaliser pour créer des visuels.", type: "digital" },
      finalDialogue: "Appuie sur le bouton pour profiter du Pack Créateur Express.",
    },
  ])("accepte un CTA adapté à un $name", ({ product, finalDialogue }) => {
    const productInput = input(10, product);
    const prompt = promptFor(10, { title: product.name, finalDialogue });
    expect(validateUgcPrompt(prompt, productInput)).toBe(prompt);
  });

  it("accepte les synonymes visuels dans tout le bloc du dernier temps", () => {
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const source = promptFor(10, { title: ebookInput.product.name, ebook: true, finalVisual: "ACTION: la cover est visible" });
    const finalLine = source.split("\n").at(-1)!;
    const prompt = source.replace(finalLine, finalLine.replace("; CAMÉRA:", "\nCAMÉRA: plan serré sur mon smartphone et l’écran du mobile;"));
    expect(validateUgcPrompt(prompt, ebookInput)).toBe(prompt);
  });

  it("relance une fois si le CTA ebook ou la couverture réelle manque", async () => {
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const invalid = promptFor(10, { title: ebookInput.product.name, ebook: true, finalDialogue: "Découvre Guide Excel Facile." });
    const valid = promptFor(10, { title: ebookInput.product.name, ebook: true });
    askText.mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    await expect(generateUgcPrompt(ebookInput)).resolves.toBe(valid);
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[1][0].at(-1).content).toContain("final_cta_missing");
  });

  it.each([
    {
      name: "produit physique",
      productInput: input(),
      invalidDialogue: "Commande Savon Kora.",
      expectedDialogue: "Appuie sur le bouton pour commander Savon Kora.",
      invalid: promptFor(10, { finalDialogue: "Commande Savon Kora." }),
    },
    {
      name: "ebook",
      productInput: input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" }),
      invalidDialogue: "Découvre Guide Excel Facile.",
      expectedDialogue: "Appuie sur le bouton pour télécharger Guide Excel Facile.",
      invalid: promptFor(10, { title: "Guide Excel Facile", ebook: true, finalDialogue: "Découvre Guide Excel Facile." }),
    },
  ])("répare uniquement le CTA manquant pour un $name après l’unique reprise IA", async ({ productInput, invalid, invalidDialogue, expectedDialogue }) => {
    askText.mockResolvedValueOnce(invalid).mockResolvedValueOnce(invalid);
    const expected = invalid.replace(`DIALOGUE EXACT: «${invalidDialogue}»`, `DIALOGUE EXACT: «${expectedDialogue}»`);

    await expect(generateUgcPrompt(productInput)).resolves.toBe(expected);
    expect(validateUgcPrompt(expected, productInput)).toBe(expected);
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("ne corrige pas le CTA automatiquement si la référence visuelle finale manque", async () => {
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const invalid = promptFor(10, {
      title: ebookInput.product.name,
      ebook: true,
      finalDialogue: "Découvre Guide Excel Facile.",
      finalVisual: "guide posé sur une table",
    });
    askText.mockResolvedValue(invalid);

    await expect(generateUgcPrompt(ebookInput)).rejects.toMatchObject({
      stage: "validation",
      details: { type: "final_cta_missing", path: "dialogue.finalCta" },
    });
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("accepte une réplique finale longue si le CTA est présent", async () => {
    const invalid = promptFor(10, { finalDialogue: "Appuie sur le bouton pour commander Savon Kora dès maintenant dans la boutique tout près de chez toi" });
    askText.mockResolvedValueOnce(invalid);
    await expect(generateUgcPrompt(input())).resolves.toBe(invalid);
    expect(askText).toHaveBeenCalledTimes(1);
  });

  it("fait primer le brief et réserve previousPrompt à la variation", async () => {
    const value = { ...input(), userBrief: "Brief prioritaire: filmer près de la fenêtre.", previousPrompt: "Variation précédente uniquement." };
    askText.mockResolvedValueOnce(promptFor(10));
    await generateUgcPrompt(value);
    const payload = JSON.parse(askText.mock.calls[0][0][1].content);
    expect(payload.userBrief).toBe(value.userBrief);
    expect(payload.previousPrompt).toBe(value.previousPrompt);
    expect(askText.mock.calls[0][0][0].content).toMatch(/brief.*prioritaire/i);
  });

  it.each([
    ["timeline", (p: string) => p.replace("6.5–10s", "7–10s"), "timeline_incomplete"],
    ["nombre de temps", (p: string) => p.replace(/6.5–10s[^\n]*/, "6.5–10s | ACTION: vraie référence du produit visible; CAMÉRA: plan vertical"), "timeline_incomplete"],
    ["CTA produit", (p: string) => p.replace("Appuie sur le bouton pour commander Savon Kora maintenant.", "Appuie sur le bouton pour découvrir Savon Kora maintenant."), "final_cta_missing"],
    ["CTA sans mention du bouton", (p: string) => p.replace("Appuie sur le bouton pour commander Savon Kora maintenant.", "Commande Savon Kora maintenant."), "final_cta_missing"],
    ["CTA trop tôt", (p: string) => p.replace("Je prends le produit et l'observe tranquillement.", "Commande le produit et l'observe tranquillement."), "cta_not_final"],
    ["bornes temporelles", (p: string) => p.replace("3–6.5s", "3–6s").replace("6.5–10s", "6–10s"), "timeline_boundaries_mismatch"],
    ["langue", (p: string) => p.replace("Tu cherches une idée nouvelle pour ta routine ?", "Looking for a new routine idea today?"), "language_mismatch"],
    ["chiffre non sourcé", (p: string) => p.replace("routine ?", "routine en 7 jours ?"), "unsupported_numeric_claim"],
    ["garantie non sourcée", (p: string) => p.replace("idée nouvelle", "idée garantie efficace"), "unsupported_guarantee"],
    ["filler", (p: string) => p.replace("Je prends le produit et l'observe tranquillement.", "Je regarde."), "known_filler"],
    ["visuel ebook", (p: string) => p.replace("couverture réelle sur téléphone tenu face caméra, titre et illustration intacts, gros plan net centré", "guide sur une table"), "final_cta_missing"],
  ])("rejette une sortie avec %s et expose la règle", (_label, mutate, type) => {
    const ebookCase = _label === "visuel ebook";
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const source = ebookCase ? promptFor(10, { title: ebookInput.product.name, ebook: true }) : promptFor(10);
    try {
      validateUgcPrompt(mutate(source), ebookCase ? ebookInput : input());
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UgcPromptGenerationError);
      expect(error).toMatchObject({ stage: "validation", details: { type } });
    }
  });

  it("fait deux retries au maximum pour une timeline invalide puis retourne une erreur typée", async () => {
    askText.mockResolvedValue(promptFor(10).replace("6.5–10s", "7–10s"));
    await expect(generateUgcPrompt(input())).rejects.toMatchObject({ name: "UgcPromptGenerationError", stage: "validation", details: { type: expect.any(String) } });
    expect(askText).toHaveBeenCalledTimes(3);
  });

  it("journalise uniquement les nombres lors d’un mauvais nombre de temps et répète les bornes fixes au retry", async () => {
    const base = promptFor(10);
    const finalLine = base.split("\n").at(-1)!;
    const invalid = `${base.replace(finalLine, finalLine.replace("6.5–10s", "6.5–8s"))}\n${finalLine.replace("6.5–10s", "8–10s")}`;
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    askText.mockResolvedValueOnce(invalid).mockResolvedValueOnce(promptFor(10)).mockResolvedValueOnce(promptFor(10));
    await expect(generateUgcPrompt(input())).resolves.toBe(promptFor(10));
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[1][0].at(-1).content).toContain("0–3, 3–6.5, 6.5–10");
    expect(log).toHaveBeenCalledWith("Studio UGC timeline beat-count mismatch", expect.objectContaining({
      duration: 10, expectedBeats: 3, actualBeats: 4, attempt: 1,
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("Commande Savon Kora");
    log.mockRestore();
  });

  it("réessaie après un échec provider puis réussit", async () => {
    askText.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce(promptFor(10));
    await expect(generateUgcPrompt(input())).resolves.toBe(promptFor(10));
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("classe OpenRouter 429 comme limite de requêtes, garde Retry-After et n’envoie pas de retries immédiats", async () => {
    askText.mockRejectedValueOnce(Object.assign(new Error("OpenRouter refused request"), {
      status: 429, retryAfter: "45", providerErrorCode: "rate_limit_exceeded",
      providerErrorMessage: "Rate limit exceeded for model", upstreamProvider: "Example Provider",
    }));
    let failure: unknown;
    try { await generateUgcPrompt(input()); } catch (error) { failure = error; }
    expect(failure).toMatchObject({
      stage: "provider",
      details: {
        type: "provider_rate_limited", httpStatus: 429, retryAfter: "45",
        upstreamCode: "rate_limit_exceeded", upstreamMessage: "Rate limit exceeded for model",
        upstreamProvider: "Example Provider",
      },
    });
    expect(askText).toHaveBeenCalledOnce();
  });

  it("respecte le délai strict de 30 secondes et expose un timeout typé", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(31_000);
    let failure: unknown;
    try { await generateUgcPrompt(input()); } catch (error) { failure = error; }
    clock.mockRestore();
    expect(failure).toMatchObject({ name: "UgcPromptGenerationError", stage: "provider", details: { type: "provider_timeout" } });
    expect(askText).not.toHaveBeenCalled();
    expect(askText.mock.calls.every((call: unknown[]) => (call[1] as { timeoutMs: number }).timeoutMs <= 30_000)).toBe(true);
  });

  it("ne contacte pas le modèle pour durée invalide ou produit vraiment générique", async () => {
    await expect(generateUgcPrompt(input(12))).rejects.toMatchObject({ stage: "input", details: { type: "invalid_duration" } });
    const generic = { ...input(), product: { name: "Produit", description: "", content: "", price: "", currency: "", category: "", type: "", tags: [], shop: "", images: [] } };
    await expect(generateUgcPrompt(generic)).rejects.toMatchObject({ stage: "input", details: { type: "missing_product_info" } });
    expect(askText).not.toHaveBeenCalled();
  });
});
