import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./sale-modal.css";
import "./page-headings.css";
import "./mobile-nav.css";
import { PwaRegister } from "./PwaRegister";
import { I18nProvider } from "@/lib/i18n/i18n";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

// L'image de partage 1200×630 vient de app/opengraph-image.tsx (convention Next.js).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "fr_FR",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/icons/vendeo-icon-1024.png", type: "image/png", sizes: "1024x1024" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/vendeo-icon-1024.png", type: "image/png", sizes: "1024x1024" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f8fa",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Thème clair unique, y compris pour les anciens choix sombres persistés.
const themeInitScript = `(function(){document.documentElement.dataset.theme="light";try{localStorage.setItem("vendeo-theme","light")}catch(e){}})()`;

// Applique la langue persistée (ou celle du navigateur) avant le premier rendu.
const langInitScript = `(function(){try{var l=localStorage.getItem("vendeo-lang");if(l!=="fr"&&l!=="en"){var m=document.cookie.match(/(?:^|; )vendeo-lang=(fr|en)(?:;|$)/);l=m?m[1]:((navigator.language||"").toLowerCase().indexOf("en")===0?"en":"fr")}document.documentElement.lang=l}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
        <PwaRegister />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
