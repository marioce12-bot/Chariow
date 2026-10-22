import type { Metadata } from "next";
import { DocumentationCenter } from "@/components/docs/DocumentationCenter";

export const metadata: Metadata = {
  title: "Documentation Vendeo | Guides, Studio et campagnes",
  description: "Les guides Vendeo en français et en anglais : boutiques Chariow, publicités, rentabilité, attribution, Studio IA, crédits et dépannage.",
  alternates: { canonical: "/docs" },
};

export default function DocumentationPage() {
  return <DocumentationCenter />;
}
