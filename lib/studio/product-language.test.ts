import { describe, expect, it } from "vitest";
import { resolveProductLanguage } from "@/lib/studio/product-language";

const en = "The complete book includes practical lessons and examples for your daily routine. It helps you learn with clear guidance and useful exercises.";
const fr = "Ce livre complet comprend des leçons pratiques et des exemples pour votre quotidien. Il vous aide à apprendre avec des conseils clairs et des exercices utiles.";
const es = "Este libro incluye lecciones y ejemplos prácticos para tu rutina diaria. Te ayuda a aprender con orientación y ejercicios útiles.";

describe("shared product-language resolver", () => {
  it("prioritizes description English over a French interface and product title", () => {
    expect(resolveProductLanguage({ name: "Le produit", description: en }, "fr")).toMatchObject({ code: "en", label: "English", detected: true });
  });
  it("prioritizes description French over an English interface and product title", () => {
    expect(resolveProductLanguage({ name: "The Product", description: fr }, "en")).toMatchObject({ code: "fr", label: "French", detected: true });
  });
  it("identifies Spanish without a French/English coercion", () => {
    expect(resolveProductLanguage({ name: "Le produit", description: es }, "fr")).toMatchObject({ code: "es", label: "Spanish", detected: true });
  });
  it("falls back for short ambiguous text, ignores HTML/script payloads and preserves non-Latin source language as und", () => {
    expect(resolveProductLanguage({ name: "Guide", description: "<script>The and book</script> Guide pratique" }, "fr")).toMatchObject({ code: "fr", detected: false });
    expect(resolveProductLanguage({ name: "A book", description: "This guide includes practical exercises." }, "fr").code).toBe("en");
    expect(resolveProductLanguage({ name: "Name", description: "Книга содержит полезные практические упражнения для каждого дня и помогает изучать новые темы." }, "fr")).toMatchObject({ code: "und", detected: true });
  });
});
