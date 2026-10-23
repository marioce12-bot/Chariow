import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TermsContent from "./TermsContent";
import { translate } from "@/lib/i18n/translate";
let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale, t: (key: string) => translate(locale, key) }) }));

describe.each(["fr", "en"] as const)("Shopify terms in %s", language => {
  it("sets merchant authorization, legal responsibilities and retention apart from buyer consent", () => {
    locale = language;
    const html = renderToStaticMarkup(createElement(TermsContent));
    expect(html).toContain(language === "fr" ? "read_products" : "read_products");
    expect(html).toContain("read_orders");
    expect(html).toContain(language === "fr" ? "base légale" : "legal basis");
    expect(html).toContain(language === "fr" ? "n’est pas le consentement des acheteurs" : "not buyer consent");
    expect(html).toContain(language === "fr" ? "90 jours" : "90 days");
    expect(html).toContain(language === "fr" ? "48 heures" : "48 hours");
    expect(html).toContain(language === "fr" ? "import par défaut de 60 jours" : "60-day import");
  });
});
