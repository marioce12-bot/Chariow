import { describe, expect, it } from "vitest";
import { getAllowedBuyHosts, isAllowedBuyUrl, isAllowedLogoUrl, parseBuyUrl, validateShopConfig } from "./config";

const base = { shopName: "Boutique d'Awa", products: [{ productId: "prd_1", buyUrl: "https://awa.mychariow.com/mon-produit" }] };
const logo = "https://res.cloudinary.com/democloud/image/upload/v123/vendeo/storefronts/abc.png";

describe("validateShopConfig", () => {
  it("accepte une configuration minimale et applique les valeurs par défaut", () => {
    const result = validateShopConfig(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.theme).toBe("light");
      expect(result.config.titleStyle).toBe("bold");
      expect(result.config.buttonLabel).toBe("Acheter");
      expect(result.config.logoUrl).toBeNull();
      expect(result.config.products[0]).toMatchObject({ productId: "prd_1", visible: true, title: null, description: null });
    }
  });

  it("exige un hexadécimal strict #RRGGBB pour la couleur", () => {
    for (const color of ["red", "#fff", "#12345g", "rgb(0,0,0)", "#1234567", "url(javascript:1)"]) {
      expect(validateShopConfig({ ...base, primaryColor: color }).ok).toBe(false);
    }
    const ok = validateShopConfig({ ...base, primaryColor: "#AABBCC" });
    expect(ok.ok && ok.config.primaryColor).toBe("#aabbcc");
  });

  it("rejette les champs inconnus (aucun HTML, CSS ou script libre)", () => {
    expect(validateShopConfig({ ...base, html: "<script>alert(1)</script>" }).ok).toBe(false);
    expect(validateShopConfig({ ...base, customCss: "body{}" }).ok).toBe(false);
    expect(validateShopConfig({ ...base, products: [{ ...base.products[0], onclick: "x" }] }).ok).toBe(false);
  });

  it("nettoie les chevrons et limite la longueur des textes", () => {
    const cleaned = validateShopConfig({ ...base, shopName: "<script>alert(1)</script>Awa" });
    expect(cleaned.ok && cleaned.config.shopName).toBe("scriptalert(1)/scriptAwa");
    expect(validateShopConfig({ ...base, shopName: "a".repeat(61) }).ok).toBe(false);
    expect(validateShopConfig({ ...base, tagline: "a".repeat(121) }).ok).toBe(false);
    expect(validateShopConfig({ ...base, shopName: "   " }).ok).toBe(false);
    expect(validateShopConfig({ ...base, shopName: 42 }).ok).toBe(false);
  });

  it("refuse les produits en double, les identifiants invalides et plus de 50 produits", () => {
    expect(validateShopConfig({ ...base, products: [base.products[0], base.products[0]] }).ok).toBe(false);
    expect(validateShopConfig({ ...base, products: [{ ...base.products[0], productId: "../etc" }] }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ productId: `p${i}`, buyUrl: "https://awa.mychariow.com/x" }));
    expect(validateShopConfig({ ...base, products: many }).ok).toBe(false);
  });

  it("exige un lien d'achat valide pour chaque produit", () => {
    expect(validateShopConfig({ ...base, products: [{ productId: "prd_1" }] }).ok).toBe(false);
    expect(validateShopConfig({ ...base, products: [{ productId: "prd_1", buyUrl: "https://evil.com/pay" }] }).ok).toBe(false);
  });

  it("n'accepte un logo que s'il vient de notre Cloudinary", () => {
    expect(validateShopConfig({ ...base, logoUrl: logo }, { cloudName: "democloud" }).ok).toBe(true);
    expect(validateShopConfig({ ...base, logoUrl: logo }).ok).toBe(false);
    expect(validateShopConfig({ ...base, logoUrl: "https://evil.com/logo.png" }, { cloudName: "democloud" }).ok).toBe(false);
  });
});

describe("parseBuyUrl / isAllowedBuyUrl", () => {
  it("accepte https sur mychariow.com et ses sous-domaines", () => {
    expect(isAllowedBuyUrl("https://mychariow.com/produit")).toBe(true);
    expect(isAllowedBuyUrl("https://awa.mychariow.com/produit?ref=1")).toBe(true);
    expect(isAllowedBuyUrl("https://AWA.MyChariow.com/produit")).toBe(true);
  });

  it("accepte aussi mychariow.shop (liens de boutiques actuels) mais pas ses faux domaines", () => {
    expect(isAllowedBuyUrl("https://mfhvijef.mychariow.shop/prd_se4zdyja")).toBe(true);
    expect(isAllowedBuyUrl("https://mychariow.shop.evil.com/prd_x")).toBe(false);
    expect(isAllowedBuyUrl("https://evilmychariow.shop/prd_x")).toBe(false);
    expect(isAllowedBuyUrl("http://abc.mychariow.shop/prd_x")).toBe(false);
  });

  it("refuse http, les faux domaines, les identifiants, les ports et les schémas dangereux", () => {
    for (const url of [
      "http://awa.mychariow.com/x",
      "https://mychariow.com.evil.com/x",
      "https://evilmychariow.com/x",
      "https://evil.com/?u=awa.mychariow.com",
      "https://evil.com/awa.mychariow.com",
      "https://user:pass@awa.mychariow.com/x",
      "https://awa.mychariow.com:8443/x",
      "https://awa.mychariow.com.:443@evil.com/x",
      "javascript:alert(1)",
      "data:text/html,hi",
      "//awa.mychariow.com/x",
      "awa.mychariow.com/x",
      "",
    ]) {
      expect(isAllowedBuyUrl(url), url).toBe(false);
    }
    expect(isAllowedBuyUrl(undefined)).toBe(false);
    expect(isAllowedBuyUrl(123)).toBe(false);
  });

  it("CHARIOW_ALLOWED_HOSTS ajoute des domaines sans retirer mychariow.shop / mychariow.com", () => {
    expect(getAllowedBuyHosts(undefined)).toEqual(["mychariow.shop", "mychariow.com"]);
    const hosts = getAllowedBuyHosts("boutique.example.org, ,com,BAD HOST");
    expect(hosts).toEqual(["mychariow.shop", "mychariow.com", "boutique.example.org"]);
    expect(parseBuyUrl("https://pay.boutique.example.org/x", hosts)).not.toBeNull();
  });
});

describe("isAllowedLogoUrl", () => {
  it("accepte uniquement res.cloudinary.com/<notre cloud>/image/upload/.../vendeo/storefronts/", () => {
    expect(isAllowedLogoUrl(logo, "democloud")).toBe(true);
    expect(isAllowedLogoUrl(logo, "autrecloud")).toBe(false);
    expect(isAllowedLogoUrl(logo, null)).toBe(false);
    expect(isAllowedLogoUrl(`${logo}?x=1`, "democloud")).toBe(false);
    expect(isAllowedLogoUrl("https://res.cloudinary.com/democloud/image/upload/v1/vendeo/chat/a.png", "democloud")).toBe(false);
    expect(isAllowedLogoUrl("http://res.cloudinary.com/democloud/image/upload/v1/vendeo/storefronts/a.png", "democloud")).toBe(false);
    expect(isAllowedLogoUrl("https://res.cloudinary.com.evil.com/democloud/image/upload/v1/vendeo/storefronts/a.png", "democloud")).toBe(false);
    expect(isAllowedLogoUrl("https://res.cloudinary.com/democloud/image/upload/v1/vendeo/storefronts/../x.png", "democloud")).toBe(false);
  });
});
