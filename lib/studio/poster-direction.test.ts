import { describe, expect, it } from "vitest";
import { buildPosterDirection, detectAudience, detectTheme } from "./poster-direction";

const always = (value: number) => () => value;

describe("direction artistique d'affiche", () => {
  it("déduit le thème du produit", () => {
    expect(detectTheme("Crée ton SaaS de A à Z").id).toBe("business et entrepreneuriat");
    expect(detectTheme("Tresses africaines : guide complet").id).toBe("beauté et mode");
    expect(detectTheme("Programme de musculation 30 jours").id).toBe("sport et bien-être");
  });

  it("un produit beauté vise une femme", () => {
    const result = buildPosterDirection({ name: "Guide des tresses", description: "Apprends la coiffure" }, always(0));
    expect(result.text).toContain("une femme");
  });

  it("public mixte : alterne avec la génération précédente", () => {
    const theme = detectTheme("Crée ton SaaS");
    expect(detectAudience("Crée ton SaaS", theme, "Crée ton SaaS", "Une femme tient le livre")).toBe("homme");
    expect(detectAudience("Crée ton SaaS", theme, "Crée ton SaaS", "Un homme tient le livre")).toBe("femme");
  });

  it("un public explicitement masculin donne un homme", () => {
    const result = buildPosterDirection({ name: "Business", description: "Pour les hommes qui veulent investir" }, always(0));
    expect(result.text).toContain("un homme");
  });

  it("ne choisit pas de personne si l'utilisateur la décrit", () => {
    const result = buildPosterDirection({ name: "Ebook business", userBrief: "avec un couple devant un ordinateur" }, always(0.99));
    expect(result.text).not.toContain("public probable");
    expect(result.withoutPerson).toBe(false);
  });

  it("ne met jamais le produit en main quand il n'y a pas de personne", () => {
    const result = buildPosterDirection({ name: "Mon ebook", description: "Un guide pratique" }, always(0.99));
    expect(result.withoutPerson).toBe(true);
    expect(result.text).not.toMatch(/en main/);
  });
});
