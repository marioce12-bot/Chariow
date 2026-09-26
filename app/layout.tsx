import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";
import { I18nProvider } from "@/lib/i18n/i18n";

export const metadata: Metadata = {
  title: "Vendeo | Ton business, enfin lisible",
  description: "Gère, analyse et optimise ton activité digitale depuis un seul espace.",
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
  themeColor: "#020B35",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Applique le thème choisi (localStorage) avant le premier rendu pour éviter un flash clair.
const themeInitScript = `(function(){try{var t=localStorage.getItem("vendeo-theme");if(t==="dark"||(!t&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.dataset.theme="dark"}}catch(e){}})()`;

// Applique la langue persistée (ou celle du navigateur) avant le premier rendu.
const langInitScript = `(function(){try{var l=localStorage.getItem("vendeo-lang");if(l!=="fr"&&l!=="en"){l=(navigator.language||"").toLowerCase().indexOf("en")===0?"en":"fr"}document.documentElement.lang=l}catch(e){}})()`;

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
