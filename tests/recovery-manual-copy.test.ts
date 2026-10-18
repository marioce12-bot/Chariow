import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translate";
const source = readFileSync(new URL("../components/dashboard/RecoveryPanel.tsx", import.meta.url), "utf8");
describe("recovery manual delivery explanation", () => {
  it("explains manual WhatsApp delivery without exposing setup jargon", () => {
    expect(source).toContain('t("sweep1.text198")');
    const copy = translate("fr", "sweep1.text198");
    expect(copy).toContain("Prépare ton message ici");
    expect(copy).toContain("ouvre WhatsApp pour le vérifier et l’envoyer toi-même");
    expect(copy).toContain("Aucun message ne part automatiquement.");
    expect(source).not.toContain("Envoi automatique : non connecté");
    expect(source).not.toContain("connecte un numéro WhatsApp Business à l’API officielle");
  });
});
