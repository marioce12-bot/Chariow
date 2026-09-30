import { describe, expect, it } from "vitest";
import { cleanAiText } from "@/lib/ai/format";
import { buildConfigFromAi, extractVitrineTag, matchProduct, VITRINE_PROMPT, VITRINE_TAG, wantsVitrine } from "./chat";
import { validateShopConfig } from "./config";

const catalog = [
  { id: "prd_1", name: "Formation Facebook Ads" },
  { id: "prd_2", name: "Ebook Marketing Digital" },
  { id: "prd_3", name: "Ebook Marketing Mobile" },
];
const url = "https://awa.mychariow.com/formation";

describe("extractVitrineTag", () => {
  it("sépare le texte et le JSON", () => {
    const result = extractVitrineTag(`Parfait, je crée ta vitrine. ${VITRINE_TAG}{"shopName":"Awa","products":[]}`);
    expect(result.found).toBe(true);
    expect(result.text).toBe("Parfait, je crée ta vitrine.");
    expect(result.payload).toEqual({ shopName: "Awa", products: [] });
  });

  it("supporte les blocs de code et le texte parasite autour du JSON", () => {
    const result = extractVitrineTag(`Ok ${VITRINE_TAG}\n\`\`\`json\n{"a":1}\n\`\`\``);
    expect(result.payload).toEqual({ a: 1 });
  });

  it("retourne un payload nul si le JSON est illisible, et ne fait rien sans balise", () => {
    expect(extractVitrineTag(`Ok ${VITRINE_TAG}{pas du json`).payload).toBeNull();
    expect(extractVitrineTag("Bonjour").found).toBe(false);
  });

  it("survit au nettoyage du texte de l'IA (cleanAiText), couleur hexadécimale comprise", () => {
    const cleaned = cleanAiText(`Je crée ta vitrine. ${VITRINE_TAG}{"shopName":"Awa","primaryColor":"#ff0000","products":[{"name":"X","buyUrl":"${url}"}]}`);
    const result = extractVitrineTag(cleaned);
    expect(result.found).toBe(true);
    expect(result.payload).toMatchObject({ shopName: "Awa", primaryColor: "#ff0000" });
  });
});

describe("matchProduct", () => {
  it("retrouve un produit par son nom, sans tenir compte de la casse ni des accents", () => {
    expect(matchProduct("formation facebook ads", catalog)).toEqual({ id: "prd_1" });
    expect(matchProduct("Ebook Marketing Digital", catalog)).toEqual({ id: "prd_2" });
  });

  it("accepte une correspondance partielle unique, refuse l'ambiguïté et l'inconnu", () => {
    expect(matchProduct("Formation Facebook", catalog)).toEqual({ id: "prd_1" });
    expect("error" in matchProduct("Ebook Marketing", catalog)).toBe(true);
    expect("error" in matchProduct("Coaching", catalog)).toBe(true);
    expect("error" in matchProduct("  ", catalog)).toBe(true);
  });
});

describe("buildConfigFromAi", () => {
  it("construit une configuration valide à partir du JSON de l'IA", () => {
    const built = buildConfigFromAi(
      { storeName: "Awa", shopName: "Boutique d'Awa", tagline: "Les meilleurs outils", theme: "dark", primaryColor: "#10b981", titleStyle: "elegant", products: [{ name: "Formation Facebook Ads", buyUrl: url }] },
      { catalog, logoUrl: null },
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      const validated = validateShopConfig(built.config);
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.config.products[0].productId).toBe("prd_1");
        expect(validated.config.theme).toBe("dark");
      }
    }
  });

  it("refuse un produit sans lien d'achat, un produit inconnu et une liste vide", () => {
    expect(buildConfigFromAi({ shopName: "A", products: [{ name: "Formation Facebook Ads" }] }, { catalog, logoUrl: null }).ok).toBe(false);
    expect(buildConfigFromAi({ shopName: "A", products: [{ name: "Inconnu", buyUrl: url }] }, { catalog, logoUrl: null }).ok).toBe(false);
    expect(buildConfigFromAi({ shopName: "A", products: [] }, { catalog, logoUrl: null }).ok).toBe(false);
    expect(buildConfigFromAi("n'importe quoi", { catalog, logoUrl: null }).ok).toBe(false);
  });

  it("ne reprend jamais un lien non autorisé ni un logo fourni par l'IA : la validation stricte les rejette", () => {
    const built = buildConfigFromAi({ shopName: "A", logoUrl: "https://evil.com/x.png", products: [{ name: "Formation Facebook Ads", buyUrl: "https://evil.com/pay" }] }, { catalog, logoUrl: null });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect("logoUrl" in built.config).toBe(false);
      expect(validateShopConfig(built.config).ok).toBe(false);
    }
  });

  it("ignore les valeurs de style inconnues au lieu de planter", () => {
    const built = buildConfigFromAi({ shopName: "A", theme: "neon", primaryColor: "rouge", titleStyle: "comic", products: [{ name: "Formation Facebook Ads", buyUrl: url }] }, { catalog, logoUrl: null });
    expect(built.ok && built.notes.length).toBe(3);
    expect(built.ok && validateShopConfig(built.config).ok).toBe(true);
  });
});

describe("wantsVitrine / prompt", () => {
  it("détecte une conversation sur les vitrines", () => {
    expect(wantsVitrine(["Je veux créer une vitrine"])).toBe(true);
    expect(wantsVitrine(["Create a storefront for my products"])).toBe(true);
    expect(wantsVitrine(["Quelles sont mes ventes ce mois-ci ?"])).toBe(false);
  });

  it("les consignes vitrine restent courtes (elles s'ajoutent au prompt, plafond relevé d'autant)", () => {
    expect(VITRINE_PROMPT.length).toBeLessThan(3000);
    expect(VITRINE_PROMPT).toContain(VITRINE_TAG);
  });
});
