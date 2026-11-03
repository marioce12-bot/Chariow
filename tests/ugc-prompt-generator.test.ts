import { beforeEach, describe, expect, it, vi } from "vitest";
const askText = vi.fn();
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { generateUgcPrompt, readUgcTimeline, validateUgcPrompt, UgcPromptGenerationError, UGC_TEXT_MODEL, type UgcGeneratorInput } from "@/lib/studio/ugc-prompt-generator";

const input = (duration = 10, product?: Partial<UgcGeneratorInput["product"]>): UgcGeneratorInput => ({
  product: { name: "Savon Kora", description: "Savon fabriqué artisanalement au Bénin.", content: "Savon doux pour la routine quotidienne.", price: "2500", currency: "XOF", category: "Beauté", images: ["https://cdn.example.com/savon.png"], type: "physique", tags: ["savon", "artisanal"], shop: "Kora", ...product },
  options: { duration, language: "français", tone: "naturel", platform: "Reels", angle: "routine quotidienne" },
  userBrief: "Dans une salle de bain lumineuse, avec une serviette blanche.", previousPrompt: "Ancienne variation à éviter.",
});

const wordCount = (value: string) => value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+)*/gu)?.length ?? 0;
const promptFor = (duration: number, options: { title?: string; ebook?: boolean; finalDialogue?: string; finalVisual?: string } = {}) => {
  const title = options.title ?? "Savon Kora";
  const ebook = options.ebook ?? false;
  const bounds = duration === 10 ? [[0, 3], [3, 6.5], [6.5, 10]] : duration === 15 ? [[0, 4], [4, 8], [8, 11.5], [11.5, 15]] : [[0, 5], [5, 10], [10, 15], [15, 21], [21, 25]];
  const dialogue = duration === 10
    ? ["Tu cherches une idée nouvelle pour ta routine ?", "Je prends le produit et l'observe tranquillement."]
    : duration === 15
      ? ["Tu cherches une idée nouvelle pour ta routine ?", "Je prends le produit et l'observe tranquillement.", "Je le tourne doucement et regarde ses détails en lumière naturelle."]
      : ["Tu cherches une idée pour ta routine sans savoir par où commencer ?", "Je prends le produit et j'observe attentivement sa forme dans la lumière.", "Je le tourne doucement et prends le temps d'observer les détails en lumière naturelle.", "Je choisis un décor simple, rapproche le produit et le garde visible devant la caméra."];
  const final = options.finalDialogue ?? (ebook ? `Télécharge ${title} dès maintenant.` : `Commande ${title} maintenant.`);
  const allDialogues = [...dialogue, final];
  const minima: Record<number, number> = { 10: 22, 15: 35, 25: 58 };
  const current = allDialogues.reduce((sum, line) => sum + wordCount(line), 0);
  if (current < minima[duration]) allDialogues[0] += ` ${Array.from({ length: minima[duration] - current }, () => "vraiment").join(" ")}`;
  const defaultVisual = ebook
    ? "ACTION: couverture réelle sur téléphone tenu face caméra, titre et illustration intacts, gros plan net centré"
    : "ACTION: vraie référence du produit tenue face caméra, clairement visible à l'écran";
  const finalVisual = options.finalVisual ?? defaultVisual;
  return `Scénario vidéo UGC — ${duration} secondes\n${bounds.map(([start, end], i) => `${start}–${end}s | ACTION: ${i === bounds.length - 1 ? finalVisual : "une personne présente le produit dans une scène quotidienne"}; CAMÉRA: plan vertical naturel; DIALOGUE EXACT: «${allDialogues[i]}»`).join("\n")}`;
};

beforeEach(() => askText.mockReset());

describe("générateur UGC texte libre avec règles de durée ciblées", () => {
  it.each([
    { duration: 10, beats: 3, min: 22, max: 28, contract: /exactement 3 temps.*22 à 28 mots.*6\.5 et 10 secondes/ },
    { duration: 15, beats: 4, min: 35, max: 42, contract: /exactement 4 temps.*35 à 42 mots.*11\.5 et 15 secondes/ },
    { duration: 25, beats: 5, min: 58, max: 68, contract: /exactement 5 temps.*58 à 68 mots.*21 et 25 secondes/ },
  ])("respecte le contrat $duration s: $beats temps et budget vocal", async ({ duration, beats, min, max, contract }) => {
    const expected = promptFor(duration);
    askText.mockResolvedValueOnce(expected);
    await expect(generateUgcPrompt(input(duration))).resolves.toBe(expected);
    const entries = readUgcTimeline(expected);
    expect(entries).toHaveLength(beats);
    const spoken = [...expected.matchAll(/DIALOGUE EXACT:\s*[«“"]([^»”"]+)[»”"]/gi)].map(match => match[1]);
    const totalWords = spoken.reduce((sum, line) => sum + wordCount(line), 0);
    expect(totalWords).toBeGreaterThanOrEqual(min);
    expect(totalWords).toBeLessThanOrEqual(max);
    expect(spoken.at(-1)).toMatch(/Commande Savon Kora maintenant/);
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
    expect(expected).not.toMatch(/^\s*\{/);
    if (duration === 25) expect(expected).toMatch(/15–21s/);
  });

  it("accepte un CTA ebook Télécharger avec couverture réelle sur téléphone", () => {
    const ebookInput = input(10, { name: "Guide Excel Facile", description: "Guide numérique pour apprendre Excel.", type: "ebook", category: "Éducation" });
    const prompt = promptFor(10, { title: ebookInput.product.name, ebook: true });
    expect(validateUgcPrompt(prompt, ebookInput)).toBe(prompt);
    expect(prompt).toMatch(/Télécharge Guide Excel Facile/);
    expect(prompt).toMatch(/couverture réelle sur téléphone/);
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

  it("relance une fois si la réplique finale dépasse les 11 mots de son créneau", async () => {
    const invalid = promptFor(10, { finalDialogue: "Commande Savon Kora dès maintenant dans la boutique tout près de chez toi" });
    const valid = promptFor(10);
    askText.mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    await expect(generateUgcPrompt(input())).resolves.toBe(valid);
    expect(askText).toHaveBeenCalledTimes(2);
    expect(askText.mock.calls[1][0].at(-1).content).toContain("final_cta_too_long");
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
    ["CTA produit", (p: string) => p.replace("Commande Savon Kora maintenant.", "Découvre Savon Kora maintenant."), "final_cta_missing"],
    ["CTA trop tôt", (p: string) => p.replace("Je prends le produit et l'observe tranquillement.", "Commande le produit et l'observe tranquillement."), "cta_not_final"],
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

  it("réessaie après un échec provider puis réussit", async () => {
    askText.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce(promptFor(10));
    await expect(generateUgcPrompt(input())).resolves.toBe(promptFor(10));
    expect(askText).toHaveBeenCalledTimes(2);
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
