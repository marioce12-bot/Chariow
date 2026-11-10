import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TermsContent from "./TermsContent";
import PrivacyContent from "./PrivacyContent";
import LegalNoticeContent from "./LegalNoticeContent";
import DataDeletionContent from "./DataDeletionContent";
import CookiePolicyContent from "./CookiePolicyContent";

const localeState = vi.hoisted(() => ({ value: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: localeState.value, t: (key: string) => key }) }));

const documents = [TermsContent, PrivacyContent, LegalNoticeContent, DataDeletionContent, CookiePolicyContent];

describe("legal identity and WhatsApp contact", () => {
  it.each(["fr", "en"] as const)("omits personal names and includes the exact support link in %s", (locale) => {
    localeState.value = locale;
    for (const Document of documents) {
      const markup = renderToStaticMarkup(createElement(Document));
      expect(markup).not.toMatch(/Rashad|Montecho|Rachad/i);
      expect(markup).not.toMatch(/\bSARL\b|\bLLC\b|limited-liability company/i);
      expect(markup).toContain('href="https://wa.me/2290191829482"');
      expect(markup).toContain("+229 01 91 82 94 82");
    }
  });
});
