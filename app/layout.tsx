import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";
import { PwaSplash } from "./PwaSplash";

export const metadata: Metadata = {
  title: "Vendeo | Ton business, enfin lisible",
  description: "L'analyste IA connecté aux ventes des créateurs de produits digitaux.",
  icons: { icon: "/icons/vendeo-app-icon.svg", apple: "/icons/vendeo-app-icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister /><PwaSplash />{children}</body></html>;
}
