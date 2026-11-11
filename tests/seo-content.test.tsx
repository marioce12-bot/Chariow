import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";
import { documentationSections } from "@/lib/docs";
import { translate } from "@/lib/i18n/translate";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: "fr", setLocale: vi.fn(), t: (key: string) => translate("fr", key) }),
}));
import { Marketing } from "@/components/Marketing";
import { DocumentationCenter } from "@/components/docs/DocumentationCenter";

function assertDocDestination(href: string) {
  const url = new URL(href, "https://www.vendeo-studio.site");
  const id = url.pathname.slice("/docs/".length);
  const section = documentationSections.find(s => s.id === id);
  expect(section, href).toBeDefined();
  if (url.hash) {
    const anchor = decodeURIComponent(url.hash.slice(1));
    expect(section?.articles.some(a => `${id}/${a.id}` === anchor), href).toBe(true);
  }
}

describe("accurate SEO copy and editorial links", () => {
  it("describes the actual product without promising real ROAS or video", () => {
    expect(SITE_TITLE).toBe("Vendeo | Publicités et Studio IA pour produits digitaux");
    expect(SITE_DESCRIPTION).toContain("Chariow");
    expect(SITE_DESCRIPTION).toContain("crée des images");
    expect(SITE_DESCRIPTION).toContain("prépare tes campagnes");
    expect(SITE_DESCRIPTION).toContain("données disponibles");
    expect(SITE_DESCRIPTION).not.toMatch(/ROAS réel|vidéo|garanti|automatiquement/i);
  });

  it("links the four homepage workflow steps to existing practical guides", () => {
    const document = new JSDOM(renderToStaticMarkup(<Marketing />)).window.document;
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".landing-guide-link")];
    expect(links).toHaveLength(4);
    links.forEach(link => assertDocDestination(link.getAttribute("href")!));
  });

  it("keeps every new editorial link attached to a server-rendered article", () => {
    const links = documentationSections.flatMap(section => section.articles.flatMap(article => article.links || []));
    expect(links.length).toBeGreaterThanOrEqual(14);
    for (const link of links.filter(link => link.href.startsWith("/docs/"))) {
      assertDocDestination(link.href);
      const url = new URL(link.href, "https://www.vendeo-studio.site");
      if (url.hash) {
        const html = renderToStaticMarkup(<DocumentationCenter initialSectionId={url.pathname.split("/")[2]} />);
        const document = new JSDOM(html).window.document;
        expect(document.getElementById(decodeURIComponent(url.hash.slice(1))), link.href).not.toBeNull();
      }
    }
  });

  it("adds a checklist within the existing campaign guide, not a new thin page", () => {
    const guide = documentationSections.find(s => s.id === "launch-campaigns")!;
    const article = guide.articles.find(a => a.id === "digital-product-checklist")!;
    expect(article.title.fr).toContain("produit digital");
    expect(article.title.en).toContain("digital product");
    expect(article.paragraphs?.map(p => p.fr).join(" ")).toContain("sans effectuer d’achat");
    expect(article.paragraphs?.map(p => p.fr).join(" ")).toContain("droits ou licences");
  });
});
