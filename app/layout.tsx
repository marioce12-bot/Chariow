import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vendeo | Ton business, enfin lisible",
  description: "L'analyste IA connecté aux ventes des créateurs de produits digitaux.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
