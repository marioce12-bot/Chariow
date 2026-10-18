import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("../components/dashboard/RecoveryPanel.tsx", import.meta.url), "utf8");
describe("recovery manual delivery explanation", () => {
  it("explains manual WhatsApp delivery without exposing setup jargon", () => {
    expect(source).toContain("Tu gardes la main sur chaque relance");
    expect(source).toContain("ouvre WhatsApp pour le vérifier et l’envoyer toi-même");
    expect(source).toContain("Aucun message ne part automatiquement.");
    expect(source).not.toContain("Envoi automatique : non connecté");
    expect(source).not.toContain("connecte un numéro WhatsApp Business à l’API officielle");
  });
});
