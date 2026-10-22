import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { assistantSections } from "@/lib/docs/assistant";
import { coreIntegrationSections } from "@/lib/docs/integrations-core";
import { socialIntegrationSections } from "@/lib/docs/integrations-social";
import { commerceSections } from "@/lib/docs/commerce";
import { studioManageSections } from "@/lib/docs/studio-manage";
import type { LocalizedText } from "@/lib/docs/types";
const mocks = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: mocks.locale, setLocale: vi.fn() }) }));
vi.mock("next/image", () => ({ default: ({ priority, ...props }: any) => <img {...props}/> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
import { DocumentationCenter } from "@/components/docs/DocumentationCenter";
const sections = [...commerceSections, ...coreIntegrationSections, ...socialIntegrationSections, ...assistantSections, ...studioManageSections];
function bilingual(value: LocalizedText) {
  for (const locale of ["fr", "en"] as const) {
    expect(typeof value[locale]).toBe("string");
    expect(value[locale].trim().length).toBeGreaterThan(3);
    expect(value[locale]).not.toMatch(/\{\{secret:|service_role|sk_live|@gmail\.com/);
  }
}
beforeEach(() => { mocks.locale = "fr"; });
describe("public documentation center", () => {
  it("provides substantial bilingual guides with stable unique anchors", () => {
    expect(sections.length).toBeGreaterThanOrEqual(22);
    for (const id of ["connect-chariow", "connect-meta", "connect-pinterest", "connect-tiktok"]) expect(sections.find(s => s.id === id)?.articles.length).toBeGreaterThanOrEqual(6);
    expect(new Set(sections.map(s => s.id)).size).toBe(sections.length);
    for (const section of sections) {
      expect(section.id).toMatch(/^[a-z0-9-]+$/);
      bilingual(section.title); bilingual(section.summary);
      expect(section.articles.length).toBeGreaterThanOrEqual(3);
      expect(new Set(section.articles.map(a => a.id)).size).toBe(section.articles.length);
      for (const article of section.articles) {
        expect(article.id).toMatch(/^[a-z0-9-]+$/); bilingual(article.title);
        [...(article.paragraphs || []), ...(article.steps || []), ...(article.bullets || []), ...(article.notice ? [article.notice] : [])].forEach(bilingual);
        expect((article.paragraphs?.length || 0) + (article.steps?.length || 0)).toBeGreaterThanOrEqual(1);
        for (const link of article.links || []) {
          bilingual(link.label);
          expect(link.href).toMatch(/^(\/|https:\/\/|#)/);
          if (link.href.startsWith('/docs#')) {
            const [sectionId, articleId] = link.href.slice(6).split('/');
            const target = sections.find(s => s.id === sectionId);
            expect(target, link.href).toBeDefined();
            if (articleId) expect(target?.articles.some(a => a.id === articleId), link.href).toBe(true);
          }
        }
      }
    }
  });
  it.each(["fr", "en"] as const)("renders localized navigation and all guide links in %s", locale => {
    mocks.locale = locale;
    const html = renderToStaticMarkup(<DocumentationCenter/>);
    expect(html).toContain(locale === "fr" ? "Le guide de votre espace Vendeo." : "Your guide to the Vendeo workspace.");
    expect(html).not.toMatch(/docs\.(?:nav|title|search)|landing\.nav/);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/login"');
    for (const section of sections) expect(html).toContain(`href="#${section.id}"`);
  });
  it("exposes the docs route in public navigation and the sitemap", () => {
    const marketing = readFileSync("components/Marketing.tsx", "utf8");
    expect(marketing.match(/href="\/docs"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(readFileSync("app/sitemap.ts", "utf8")).toContain("/docs");
    expect(existsSync("app/docs/page.tsx")).toBe(true);
    expect(readFileSync("middleware.ts", "utf8")).not.toMatch(/matcher:.*["']\/docs/);
  });
  it("has no generation, campaign or checkout API calls in documentation", () => {
    const source = readFileSync("components/docs/DocumentationCenter.tsx", "utf8");
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });
});
