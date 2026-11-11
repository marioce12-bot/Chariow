import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { documentationSections } from "@/lib/docs";
import { generateMetadata, generateStaticParams } from "@/app/docs/[guide]/page";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", setLocale: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <img {...props} /> }));
import { DocumentationCenter } from "@/components/docs/DocumentationCenter";

describe("documentation SEO routes", () => {
  it("publishes every registry section as a static guide param", () => {
    expect(generateStaticParams().map(({ guide }) => guide)).toEqual(documentationSections.map(({ id }) => id));
    expect(new Set(documentationSections.map(({ id }) => id)).size).toBe(documentationSections.length);
  });

  it("renders the guide content and article anchors in server markup", () => {
    const section = documentationSections[0];
    const html = renderToStaticMarkup(<DocumentationCenter initialSectionId={section.id} />);
    expect(html).toContain(section.title.fr);
    expect(html).toContain(`id="${section.id}/${section.articles[0].id}"`);
    expect(html).not.toContain("docs-guide-index");
  });

  it("provides French metadata and a canonical guide URL", async () => {
    const section = documentationSections[0];
    const metadata = await generateMetadata({ params: Promise.resolve({ guide: section.id }) });
    expect(metadata.title).toContain(section.title.fr);
    expect(metadata.description).toBe(section.summary.fr);
    expect(metadata.alternates?.canonical).toBe(`https://www.vendeo-studio.site/docs/${section.id}`);
    expect(metadata.openGraph?.url).toBe(`https://www.vendeo-studio.site/docs/${section.id}`);
  });
});
