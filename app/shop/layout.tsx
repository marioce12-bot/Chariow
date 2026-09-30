import type { Viewport } from "next";
import "./shop.css";

// La vitrine surcharge le viewport du layout racine (qui bloque le zoom) : accessibilité sur mobile.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, viewportFit: "cover" };

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
