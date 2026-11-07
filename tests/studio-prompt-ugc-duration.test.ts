import { beforeEach, describe, expect, it, vi } from "vitest";
import { ugcFixtureResponse } from "@/tests/fixtures/ugc";
const { requireUser, askText, renderer, credits } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn(), renderer: vi.fn(), credits: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText: (...args: unknown[]) => askText(...args) }));
import { POST } from "@/app/api/studio/prompt/route";
const product = { name: "Savon Kora", description: "Savon fabriqué artisanalement au Bénin.", content: "Savon doux pour routine", price: 2500, currency: "XOF", category: "Beauté", type: "physique", tags: ["savon"], shop: "Kora", image: "https://example.test/savon.jpg" };
const promptFor = (duration: number) => ugcFixtureResponse([{ role: "user", content: JSON.stringify({ product: { title: product.name, description: product.description, type: product.type, category: product.category }, options: { duration, language: "français" } }) }]);
const request = (body: unknown) => new Request("https://preview.example/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const bodyFor = (duration: number | string) => ({ product, mediaType: "video", duration, aspectRatio: "9:16", locale: "fr", userBrief: "Plan dans une salle de bain claire", previousPrompt: "Variation uniquement" });
beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: "test-user" } }); });
describe("API Studio UGC texte libre", () => {
  it("retourne un prompt et un plan cohérents, tous deux fixés à 30 s", async () => {
    const duration = 30;
    askText.mockResolvedValueOnce(promptFor(duration));
    const response = await POST(request(bodyFor(duration))); expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty("prompt"); expect(result).toHaveProperty("plan"); expect(result).toHaveProperty("preparedUgc");
    expect(result).toHaveProperty("locked"); expect(result).toHaveProperty("contentLanguage");
    expect(result).not.toHaveProperty("analysis"); expect(result).not.toHaveProperty("creative"); expect(result).not.toHaveProperty("scenarioFallback");
    expect(result.plan.duration).toBe(duration);
    expect(result.plan.segments.map((segment: { duration: number }) => segment.duration)).toEqual([15, 15]);
    const payload = JSON.parse(askText.mock.calls[0][0][1].content);
    expect(payload.product).toMatchObject({ title: product.name, description: product.description, content: product.content, price: String(product.price), currency: product.currency, category: product.category, type: product.type, tags: product.tags, shop: product.shop, hasReferenceImage: true });
    expect(payload.userBrief).toBe("Plan dans une salle de bain claire"); expect(payload.previousPrompt).toBe("Variation uniquement");
    expect(askText.mock.calls[0][1].responseSchema).toBeUndefined();
    expect(askText).toHaveBeenCalledTimes(1);
    expect(result.prompt).toContain("25–30s");
  });
  it.each([5, 10, 12, 15, 25, 31, "abc"]) ("rejette la durée non fixe %s avant tout appel modèle", async duration => {
    const response = await POST(request(bodyFor(duration))); expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input", keyPath: "options.duration", supported: [30] });
    expect(askText).not.toHaveBeenCalled();
  });
  it("refuse le contexte produit générique sans appeler le modèle", async () => {
    const response = await POST(request({ ...bodyFor(30), product: { name: "Produit", description: "", category: "", type: "", tags: [] } }));
    expect(response.status).toBe(400); expect(askText).not.toHaveBeenCalled();
  });
  it.each(["provider", "validation"]) ("retourne une erreur %s sans plan, fallback, rendu ni crédits", async failure => {
    const error = Object.assign(new Error(failure), { name: "UgcPromptGenerationError", stage: failure, details: { type: failure === "provider" ? "provider_error" : "timeline_incomplete", path: "timeline" } });
    askText.mockRejectedValue(error);
    const response = await POST(request(bodyFor(30)));
    expect([502, 504]).toContain(response.status);
    const result = await response.json();
    expect(result).toMatchObject({ code: "ugc_prompt_generation_failed", error: "Le scénario n’a pas pu être généré, réessaie.", failureRule: expect.any(String) });
    expect(result).not.toHaveProperty("plan"); expect(result).not.toHaveProperty("preparedUgc"); expect(result).not.toHaveProperty("scenarioFallback");
    expect(JSON.stringify(result)).not.toContain("provider unavailable");
    expect(renderer).not.toHaveBeenCalled(); expect(credits).not.toHaveBeenCalled();
  });
  it("retente une erreur provider puis retourne le résultat si la correction réussit", async () => {
    askText.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce(promptFor(30));
    const response = await POST(request(bodyFor(30))); expect(response.status).toBe(200); expect(askText).toHaveBeenCalledTimes(2);
  });
  it("ne lance aucun moteur de rendu ni débit de crédits pendant la préparation", async () => {
    askText.mockResolvedValueOnce(promptFor(30));
    expect((await POST(request(bodyFor(30)))).status).toBe(200);
    expect(renderer).not.toHaveBeenCalled(); expect(credits).not.toHaveBeenCalled();
  });
});
