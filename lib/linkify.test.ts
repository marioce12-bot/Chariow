import { describe, expect, it } from "vitest";
import { splitLinks } from "./linkify";

const links = (text: string) => splitLinks(text).filter((part) => part.type === "link").map((part) => (part as { href: string }).href);

describe("splitLinks", () => {
  it("rend un lien https cliquable au milieu d'une phrase", () => {
    expect(splitLinks("Ta vitrine : https://vendeo-studio.site/shop/awa voilà")).toEqual([
      { type: "text", value: "Ta vitrine : " },
      { type: "link", value: "https://vendeo-studio.site/shop/awa", href: "https://vendeo-studio.site/shop/awa" },
      { type: "text", value: " voilà" },
    ]);
  });

  it("sépare deux liens collés l'un à l'autre (cas du chat)", () => {
    expect(links("https://abc.mychariow.shop/prd_se4zdyjahttps://mfhvijef.mychariow.shop/prd_x1")).toEqual([
      "https://abc.mychariow.shop/prd_se4zdyja",
      "https://mfhvijef.mychariow.shop/prd_x1",
    ]);
  });

  it("retire la ponctuation finale", () => {
    expect(links("Voir (https://a.mychariow.shop/p).")).toEqual(["https://a.mychariow.shop/p"]);
    expect(links("Lien : https://a.mychariow.shop/p, merci !")).toEqual(["https://a.mychariow.shop/p"]);
  });

  it("gère www. et ignore ce qui n'est pas un lien web", () => {
    expect(links("va sur www.exemple.com/page")).toEqual(["https://www.exemple.com/page"]);
    expect(links("sous-www.exemple.com")).toEqual([]);
    expect(links("javascript:alert(1) et ftp://x.com/a et https://")).toEqual([]);
  });

  it("conserve le texte sans lien tel quel", () => {
    expect(splitLinks("Bonjour\nça va ?")).toEqual([{ type: "text", value: "Bonjour\nça va ?" }]);
    expect(splitLinks("")).toEqual([]);
  });

  it("reconstitue exactement le texte d'origine", () => {
    const text = "a https://x.com/y. b www.z.fr, c";
    expect(splitLinks(text).map((part) => part.value).join("")).toBe(text);
  });
});
