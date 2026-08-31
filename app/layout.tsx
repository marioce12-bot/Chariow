import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

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
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
