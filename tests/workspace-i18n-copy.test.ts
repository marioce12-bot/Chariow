import { describe, expect, it } from "vitest";
import { workspaceCopy } from "@/lib/i18n/workspace-copy";

describe("workspace chrome localization", () => {
  it("provides parallel French and English copy for every workspaceExtra key", () => {
    expect(Object.keys(workspaceCopy.en).sort()).toEqual(Object.keys(workspaceCopy.fr).sort());
    expect(Object.keys(workspaceCopy.en).length).toBeGreaterThan(0);
    for (const [key, english] of Object.entries(workspaceCopy.en)) {
      expect(key).toMatch(/^workspaceExtra\./);
      expect(english.trim()).not.toBe("");
      expect(workspaceCopy.fr[key].trim()).not.toBe("");
    }
  });

  it("does not leave French words in English workspace chrome", () => {
    const frenchTokens = /\b(?:Abonnement|Déconnexion|Paramètres|Réessayer|Annuler|personnage|boutique|données|créateur)\b/i;
    for (const [key, english] of Object.entries(workspaceCopy.en)) {
      expect(english, key).not.toMatch(frenchTokens);
    }
  });
});
