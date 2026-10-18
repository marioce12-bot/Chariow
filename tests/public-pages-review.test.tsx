import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "@/app/about/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import DeletionPage from "@/app/data-deletion/page";

const pages = [AboutPage, TermsPage, PrivacyPage, DeletionPage];

describe("public pages review", () => {
  it.each(pages)("provides correct direct contacts and an accessible contents list", (Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('href="mailto:vendeo008@gmail.com"');
    expect(html).toContain('href="https://wa.me/2290191829482"');
    expect(html).toContain("+229 0191829482");
    expect(html).toContain('aria-label="Sommaire"');
    expect(html).not.toContain("marioceatin@gmail.com");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it.each([TermsPage, PrivacyPage])("makes the legal review status explicit", (Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Version de travail");
    expect(html).toContain("avant toute mise en production");
    expect(html).toContain("confirmer");
  });

  it("does not index legal drafts", () => {
    expect(termsMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(privacyMetadata.robots).toMatchObject({ index: false, follow: false });
  });

  it.each(pages)("gives every contents link a matching section", (Page) => {
    const html = renderToStaticMarkup(<Page />);
    for (const match of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html).toContain(`id="${match[1]}"`);
    }
  });
});
