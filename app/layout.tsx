import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = {
  title: "Vendeo | Ton business, enfin lisible",
  description: "L'analyste IA connecté aux ventes des créateurs de produits digitaux.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
