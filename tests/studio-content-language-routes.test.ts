import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
import { POST } from "@/app/api/studio/prompt/route";
import { buildImageEditInstruction } from "@/lib/studio/image-edit-prompt";

const english = { name: "Guide pratique", description: "This downloadable guide is available in PDF format. Each chapter includes practical exercises and a materials checklist. You can read the guide on your phone without an internet connection." };
const french = { name: "Practical Guide", description: "Ce guide est disponible au format PDF. Chaque chapitre présente des exercices pratiques et une liste de matériel. La lecture est possible sans connexion sur votre téléphone." };
const spanish = { name: "Guía práctica", description: "Esta guía está disponible en formato PDF. Cada capítulo contiene ejercicios prácticos y una lista de materiales. Puedes leer la guía en tu teléfono sin conexión a internet." };
const request = (body: unknown) => new Request("https://test.invalid/api/studio/prompt", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ user: { id: "test-user" } });
  askText.mockResolvedValue('{"style":"editorial","composition":"asymmetric","copyIndices":[0,1],"direction":"product_film"}');
});

describe("Studio product language is independent of interface locale", () => {
  it.each([
    [english, "fr", "en", "English"],
    [french, "en", "fr", "French"],
    [spanish, "fr", "es", "Spanish"],
  ])("prepares slideshow in the source language with UI locale %s", async (product, locale, code, label) => {
    const response = await POST(request({ product, locale, mediaType: "video", videoMode: "slideshow", duration: 25 }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.contentLanguage).toMatchObject({ code, label });
    expect(body.slideshow.slides).toHaveLength(5);
    for (const slide of body.slideshow.slides) {
      expect(slide.prompt).toContain(label);
      if (code !== "fr") expect(slide.prompt).not.toContain("Découvre ce produit");
    }
    expect(askText).not.toHaveBeenCalled();
  });

  it.each([[english, "fr", "en"], [french, "en", "fr"], [spanish, "fr", "es"]])("keeps image copy in the source language", async (product, locale, code) => {
    const response = await POST(request({ product, locale }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.contentLanguage.code).toBe(code);
    expect(body.prompt).toContain(product.name);
    expect(body.prompt).toContain(product.description.split(". ")[0]);
    expect(body.prompt).toContain("Never translate or paraphrase");
    expect(body.prompt.length).toBeLessThanOrEqual(4000);
    // The text service is mocked: no provider or credit operation is available here.
    expect(askText).toHaveBeenCalledOnce();
  });

  it("keeps locked video preparation in English despite French UI", async () => {
    const response = await POST(request({ product: english, locale: "fr", mediaType: "video", duration: 30 }));
    const body = await response.json();
    expect(body.locked).toBe(true);
    expect(body.contentLanguage.code).toBe("en");
    for (const segment of body.plan.segments) {
      expect(segment.prompt).toContain("Visible language and narration: English");
      expect(segment.prompt).not.toContain("Découvre ce produit");
    }
  });

  it("does not interpret French retouch instructions as translation", () => {
    const prompt = buildImageEditInstruction("Agrandis le titre et rends le fond plus clair.");
    expect(prompt).toContain("Agrandis le titre");
    expect(prompt).toContain("Preserve the original language and exact wording");
    expect(prompt).toContain("not a request to translate");
    expect(prompt).toContain("do not invent unseen contents");
  });
});
