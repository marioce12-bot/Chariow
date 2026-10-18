import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "./locales";
import { translate } from "./translate";
import AboutContent from "@/components/legal/AboutContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import TermsContent from "@/components/legal/TermsContent";
import DataDeletionContent from "@/components/legal/DataDeletionContent";
import { DashboardStoreSelector } from "@/components/dashboard/StoreSelector";
import { MetaAccountSkeleton } from "@/components/dashboard/MetaAccountSkeleton";
import { FeedbackView } from "@/components/FeedbackView";
import { SkeletonRows } from "@/components/dashboard/Skeleton";

let locale: Locale = "fr";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale, t: (key: string, variables?: Record<string, string | number>) => translate(locale, key, variables) }),
}));

const documents = [
  [AboutContent, /About/i, /À propos/],
  [PrivacyContent, /Privacy policy/i, /Politique de confidentialité/],
  [TermsContent, /Terms of use/i, /Conditions d’utilisation/],
  [DataDeletionContent, /Data deletion/i, /Suppression des données/],
] as const;

describe.each(["fr", "en"] as const)("public and mobile UI rendering in %s", (language) => {
  it.each(documents)("renders the document in the selected language: %s", (Document, english, french) => {
    locale = language;
    const html = renderToStaticMarkup(<Document />);
    expect(html).toMatch(language === "en" ? english : french);
    if (language === "en") expect(html).not.toContain("Retour à l’accueil");
    else expect(html).toContain("Retour");
    expect(html).toContain(Document === AboutContent ? 'href="/"' : Document === DataDeletionContent ? 'href="/privacy"' : 'href="/register"');
  });

  it("translates the mobile selector without translating the store name or changing its value", () => {
    locale = language;
    const html = renderToStaticMarkup(<DashboardStoreSelector mobile stores={[{ id: "store-original", store_name: "Ma boutique française" }]} selectedStoreId="store-original" onChange={() => {}} />);
    expect(html).toContain(language === "en" ? "Selected store" : "Boutique affichée");
    expect(html).toContain("Ma boutique française");
    expect(html).toContain('value="store-original"');
    expect(html).toContain('id="mobile-dashboard-store"');
  });

  it("renders feedback actions as translated labels rather than source expressions", () => {
    locale = language;
    const html = renderToStaticMarkup(<FeedbackView />);
    expect(html).not.toContain("{t(");
    expect(html).toContain(translate(language, "adminComplete.sendFeedback"));
  });

  it("localizes accessible loading states while preserving the shimmer structure", () => {
    locale = language;
    const account = renderToStaticMarkup(<MetaAccountSkeleton />);
    const rows = renderToStaticMarkup(<SkeletonRows />);
    expect(account).toContain(language === "en" ? "Loading Meta account data" : "Chargement des données du compte Meta");
    expect(rows).toContain(language === "en" ? "Loading" : "Chargement");
    expect(account).toContain('aria-busy="true"');
    expect(account).toContain("mas-shape");
    expect(rows).toContain('role="status"');
  });
});
