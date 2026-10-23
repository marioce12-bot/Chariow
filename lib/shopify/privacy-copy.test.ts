import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { SHOPIFY_PRIVACY_COPY } from "./privacy-copy";
import { translate } from "@/lib/i18n/translate";
let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale, t: (key: string) => translate(locale, key) }) }));
describe.each(["fr", "en"] as const)("Shopify privacy review in %s", language => {
  it("renders the four Shopify disclosures and preserves contact/deletion links", () => {
    locale = language;
    const html = renderToStaticMarkup(createElement(PrivacyContent));
    for (const text of Object.values(SHOPIFY_PRIVACY_COPY[language])) {
      // React HTML-escapes text; compare a separately escaped paragraph.
      const escaped = renderToStaticMarkup(createElement("p", null, text)).slice(3, -4);
      expect(html).toContain(escaped);
    }
    expect(html).toContain('href="/data-deletion"');
    expect(html).toContain('href="mailto:vendeo008@gmail.com"');
    expect(html).toContain('href="/register"');
  });
  it("discloses the active-database retention and distinct import window", () => {
    const copy = SHOPIFY_PRIVACY_COPY[language];
    expect(copy.retention).toContain("60");
    expect(copy.retention).toContain("90");
    expect(copy.retention).toContain("48");
    expect(copy.retention).toMatch(language === "fr" ? /première observation.*migration/ : /first observation.*migration/);
    expect(copy.retention).toMatch(language === "fr" ? /sans aucune de ces deux dates est conservée/ : /neither date is retained/);
    expect(copy.retention).toMatch(language === "fr" ? /ne supprime ni ne requalifie/ : /does not delete or reclassify/);
    expect(copy.retention).toContain("shop/redact");
    expect(copy.retention).toContain("customers/redact");
    expect(copy.retention).toContain("customers/data_request");
    expect(copy.retention).toMatch(language === "fr" ? /hachage.*domaine de boutique/ : /hash of the ID and store domain/);
    expect(copy.retention).toMatch(language === "fr" ? /sauvegardes, journaux/ : /backups, logs/);
    expect(copy.data).toMatch(language === "fr" ? /pas considérés comme anonymes/ : /not considered anonymous/);
  });
  it("names verified processors and limits secondary AI provider claims", () => {
    const sharing = SHOPIFY_PRIVACY_COPY[language].sharing;
    for (const name of ["Google Gemini", "Vercel", "Supabase", "Brevo", "Groq", "Imole"]) expect(sharing).toContain(name);
    expect(sharing).toMatch(language === "fr" ? /ne sont pas établis comme destinataires/ : /does not establish them as recipients/);
  });
});
