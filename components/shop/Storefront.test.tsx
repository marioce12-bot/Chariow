import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ShopOk } from "@/lib/shop/data";
import { ShopProductDetail, ShopStorefront } from "./Storefront";

const payload = "<img src=x onerror=alert(1)>";
const view: ShopOk = {
  state: "ok",
  preview: false,
  storefrontId: "sf_1",
  slug: "awa",
  config: {
    version: 1,
    theme: "dark",
    primaryColor: "#10b981",
    titleStyle: "elegant",
    shopName: `Awa ${payload}`,
    tagline: `Accroche ${payload}`,
    about: "Ligne 1\nLigne 2",
    buttonLabel: "Acheter",
    logoUrl: null,
    products: [{ productId: "prd_1", buyUrl: "https://awa.mychariow.com/secret-link", visible: true, title: null, description: null }],
  },
  items: [{ id: "prd_1", title: `Formation ${payload}`, description: "<script>alert(1)</script> Description", price: "5 000 FCFA", image: "https://cdn.example.com/a.png" }],
  productsError: false,
  pixelId: null,
};

describe("rendu de la vitrine", () => {
  it("échappe tout texte (aucun HTML injecté ne sort tel quel)", () => {
    const html = renderToStaticMarkup(<ShopStorefront view={view} query="" />);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("le bouton Acheter passe par la route serveur et ne révèle pas le lien de paiement", () => {
    const html = renderToStaticMarkup(<ShopStorefront view={view} query="utm_source=fb&utm_campaign=promo" />);
    expect(html).toContain('href="/shop/awa/buy/prd_1?utm_source=fb&amp;utm_campaign=promo"');
    expect(html).not.toContain("mychariow.com");
    expect(html).toContain("--shop-primary:#10b981");
    expect(html).toContain("shop-theme-dark");
    expect(html).toContain("5 000 FCFA");
  });

  it("en aperçu (non publiée), le bouton est inactif et un bandeau est affiché", () => {
    const html = renderToStaticMarkup(<ShopStorefront view={{ ...view, preview: true }} query="" />);
    expect(html).toContain('href="#"');
    expect(html).toContain("Aperçu privé");
  });

  it("affiche les états vides", () => {
    expect(renderToStaticMarkup(<ShopStorefront view={{ ...view, items: [] }} query="" />)).toContain("Aucun produit à afficher");
    expect(renderToStaticMarkup(<ShopStorefront view={{ ...view, items: [], productsError: true }} query="" />)).toContain("momentanément indisponibles");
  });

  it("la page produit affiche le détail et le même bouton", () => {
    const html = renderToStaticMarkup(<ShopProductDetail view={view} item={view.items[0]} query="" />);
    expect(html).toContain('href="/shop/awa/buy/prd_1"');
    expect(html).toContain("Tous les produits");
  });
});
