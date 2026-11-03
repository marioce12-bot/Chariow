import { beforeEach, describe, expect, it, vi } from "vitest";
const askText = vi.fn();
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { generateUgcPrompt, validateUgcPrompt, UgcPromptGenerationError, UGC_TEXT_MODEL, type UgcGeneratorInput } from "@/lib/studio/ugc-prompt-generator";

const input = (duration = 10): UgcGeneratorInput => ({
  product: { name: "Savon Kora", description: "Savon fabriqué artisanalement au Bénin.", content: "Savon doux pour la routine quotidienne.", price: "2500", currency: "XOF", category: "Beauté", type: "physique", tags: ["savon", "artisanal"], shop: "Kora", images: ["https://cdn.example.com/savon.png"] },
  options: { duration, language: "français", tone: "naturel", platform: "Reels", angle: "routine quotidienne" },
  userBrief: "Dans une salle de bain lumineuse, avec une serviette blanche.", previousPrompt: "Ancienne variation à éviter.",
});

const promptFor = (duration: number, title = "Savon Kora") => {
  const bounds = duration === 10 ? [[0, 3], [3, 7], [7, 10]] : duration === 15 ? [[0, 4], [4, 9], [9, 15]] : [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25]];
  return `Scénario vidéo UGC — ${duration} secondes\n${bounds.map(([start, end], i) => `${start}–${end}s | ACTION: une personne présente ${title} dans sa routine; CAMÉRA: plan vertical naturel; DIALOGUE EXACT: «${i === 0 ? "Tu cherches un savon artisanal pour ta routine ?" : i === bounds.length - 1 ? `Découvre ${title} dans la boutique Kora.` : `Je prends ${title} et regarde son étiquette.`}»`).join("\n")}`;
};

beforeEach(() => askText.mockReset());

describe("générateur de prompt UGC en texte libre", () => {
  it.each([10, 15, 25])("génère un texte lisible couvrant %is", async duration => {
    const expected = promptFor(duration);
    askText.mockResolvedValueOnce(expected);
    await expect(generateUgcPrompt(input(duration))).resolves.toBe(expected);
    expect(validateUgcPrompt(expected, input(duration))).toBe(expected);
    expect(askText).toHaveBeenCalledTimes(1);
    const [messages, options] = askText.mock.calls[0];
    expect(options).toMatchObject({ order: ["openrouter"], model: UGC_TEXT_MODEL, timeoutMs: expect.any(Number) });
    expect(options.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(options.responseSchema).toBeUndefined();
    const payload = JSON.parse(messages[1].content);
    expect(payload.product).toMatchObject({ title: "Savon Kora", description: input(duration).product.description, content: input(duration).product.content, hasReferenceImage: true });
    expect(payload.options).toEqual(input(duration).options);
    expect(payload.userBrief).toBe(input(duration).userBrief);
    expect(payload.previousPrompt).toBe(input(duration).previousPrompt);
    expect(expected).not.toMatch(/^\s*\{/);
    if (duration === 25) expect(expected).toMatch(/15–20s/);
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
    ["timeline", (p: string) => p.replace("7–10s", "8–10s"), "timeline_incomplete"],
    ["produit", (p: string) => p.replaceAll("Savon Kora", "le produit"), "product_name_missing"],
    ["langue", (p: string) => p.replace("Tu cherches un savon artisanal pour ta routine ?", "Looking for handmade soap?"), "language_mismatch"],
    ["chiffre non sourcé", (p: string) => p.replace("routine ?", "routine en 7 jours ?"), "unsupported_numeric_claim"],
    ["garantie non sourcée", (p: string) => p.replace("savon artisanal", "savon garanti efficace"), "unsupported_guarantee"],
    ["filler", (p: string) => p.replace("Je prends Savon Kora et regarde son étiquette.", "Je regarde."), "known_filler"],
  ])("rejette une sortie avec %s et expose la règle", (_label, mutate, type) => {
    try {
      validateUgcPrompt(mutate(promptFor(10)), input());
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UgcPromptGenerationError);
      expect(error).toMatchObject({ stage: "validation", details: { type } });
    }
  });

  it("fait deux retries au maximum puis retourne une erreur typée", async () => {
    askText.mockResolvedValue(promptFor(10).replace("7–10s", "8–10s"));
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
