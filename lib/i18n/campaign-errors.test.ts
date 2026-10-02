import { describe, expect, it } from "vitest";
import { campaignErrorMessage } from "./campaign-errors";
import { translations } from "./translations";
import type { Locale } from "./locales";

function translate(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => {
    const value = key.split(".").reduce<unknown>((node, part) => {
      if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
        return (node as Record<string, unknown>)[part];
      }
      return undefined;
    }, translations[locale] as unknown);
    if (typeof value !== "string") return key;
    return Object.entries(vars ?? {}).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)), value);
  };
}

describe("campaignErrorMessage", () => {
  it("turns TikTok's payment prompt into clear French and English instructions", () => {
    const raw = "TikTok n’a pas accepté la campagne : Complete payment to continue. Réessaie.";
    const french = campaignErrorMessage(raw, "fr", translate("fr"), "tiktok");
    const english = campaignErrorMessage(raw, "en", translate("en"), "tiktok");

    expect(french).toContain("facturation");
    expect(french).toContain("TikTok Ads Manager");
    expect(english).toContain("billing");
    expect(english).toContain("TikTok Ads Manager");
    expect(french).not.toContain("Complete payment to continue");
    expect(english).not.toContain("Complete payment to continue");
  });

  it("hides the old technical objective_type rejection behind a useful explanation", () => {
    const oldError = "objective_type: one or more value of the params is not acceptable, current is WEBSITE_CONVERSIONS";
    const french = campaignErrorMessage(oldError, "fr", translate("fr"), "tiktok");
    const english = campaignErrorMessage(oldError, "en", translate("en"), "tiktok");

    expect(french).toContain("corrigé");
    expect(english).toContain("corrected");
    expect(french).not.toContain("objective_type");
    expect(french).not.toContain("WEBSITE_CONVERSIONS");
    expect(english).not.toContain("objective_type");
  });

  it("replaces unsupported country codes with localized country names", () => {
    const raw = "Ce compte TikTok ne permet pas de cibler : BJ, NG. Retire ces pays ou sélectionne un autre compte.";
    const french = campaignErrorMessage(raw, "fr", translate("fr"), "tiktok");
    const english = campaignErrorMessage(raw, "en", translate("en"), "tiktok");

    expect(french).toContain("Bénin");
    expect(french).toContain("Nigeria");
    expect(english).toContain("Benin");
    expect(english).toContain("Nigeria");
    expect(english).not.toContain("BJ");
  });

  it("never exposes an unrecognized provider/API error verbatim", () => {
    const raw = "APIError code=991 trace_id=secret invalid field: internal_object";
    const message = campaignErrorMessage(raw, "en", translate("en"), "meta");
    expect(message).toContain("could not launch");
    expect(message).not.toContain("APIError");
    expect(message).not.toContain("internal_object");
  });
});
