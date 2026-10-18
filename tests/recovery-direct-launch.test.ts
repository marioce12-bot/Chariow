import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translate";
const source = readFileSync(new URL("../components/dashboard/RecoveryPanel.tsx", import.meta.url), "utf8");

describe("direct WhatsApp draft button", () => {
  it("has no checkbox or consent-dependent disabled state", () => {
    expect(source).not.toContain('type="checkbox"');
    expect(source).not.toContain("setConsents");
    expect(source).not.toContain("consents[");
    expect(source).toContain("disabled={disabled || !candidate.phone || !candidate.paymentUrl}");
  });
  it("opens a popup before awaiting the draft and never submits consent or delivery", () => {
    const launch = source.slice(source.indexOf("async function launch("), source.indexOf("async function prepare("));
    expect(launch).toContain('post({sourceSaleId:candidate.id}, "/api/recovery/launch")');
    expect(launch.indexOf("beginWhatsAppWindow()")).toBeLessThan(launch.indexOf("await post("));
    expect(launch).not.toContain("consent");
    expect(launch).not.toContain('action: "sent"');
    expect(launch).toContain("target?.close()");
    expect(launch).toContain("target,false");
    expect(source).toContain("setPreview(data)");
    expect(source).toContain("target.location.replace(data.url)");
  });
  it("retains historical records, consent display and explicit delivery confirmation", () => {
    expect(source).toContain("rows.map((row)");
    expect(source).toContain("row.consent_source");
    expect(source).toContain('post({ action: "sent", id: row.id })');
    expect(source).toContain('t("sweep1.text159")');
  });
  it("explains immediate draft opening in French and English", () => {
    for (const locale of ["fr", "en"] as const) {
      const instruction = translate(locale, "sweep1.text186");
      expect(instruction).toContain("WhatsApp");
      expect(instruction).not.toMatch(/Confirme le consentement|Confirm consent/);
      const clarification = translate(locale, "sweep1.text171");
      expect(clarification).toMatch(/sans l’envoyer|without sending/);
      expect(clarification).toMatch(/ni enregistrer de consentement|or recording consent/);
      expect(translate(locale, "finalExtra.text14")).toContain("WhatsApp");
    }
    expect(source).toContain("Aucun consentement ni envoi de message n’a été enregistré.");
    expect(source).toContain("No consent or message delivery has been recorded.");
  });
});
