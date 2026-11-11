import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentationCenter } from "@/components/docs/DocumentationCenter";
import { documentationSections } from "@/lib/docs";
import { SITE_URL } from "@/lib/site";

type Props = { params: Promise<{ guide: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return documentationSections.map(({ id }) => ({ guide: id }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guide } = await params;
  const section = documentationSections.find(item => item.id === guide);
  if (!section) return {};
  const url = `${SITE_URL}/docs/${section.id}`;
  return {
    title: `${section.title.fr} | Documentation Vendeo`,
    description: section.summary.fr,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: `${section.title.fr} | Documentation Vendeo`, description: section.summary.fr, siteName: "Vendeo", locale: "fr_FR" },
    twitter: { card: "summary", title: `${section.title.fr} | Documentation Vendeo`, description: section.summary.fr },
  };
}
export default async function GuidePage({ params }: Props) {
  const { guide } = await params;
  const section = documentationSections.find(item => item.id === guide);
  if (!section) notFound();
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Documentation", item: `${SITE_URL}/docs` },
      { "@type": "ListItem", position: 2, name: section.title.fr, item: `${SITE_URL}/docs/${section.id}` },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} /><DocumentationCenter initialSectionId={section.id} /></>;
}
