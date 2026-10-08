import type { Metadata } from "next";
import { Marketing } from "@/components/Marketing";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProofImages } from "@/lib/get-proof-images";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icons/vendeo-icon-1024.png` },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, inLanguage: "fr", publisher: { "@id": `${SITE_URL}/#organization` } },
    { "@type": "SoftwareApplication", name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "fr" },
  ],
};

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const proofImages = getProofImages();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <Marketing proofImages={proofImages} />
    </>
  );
}
