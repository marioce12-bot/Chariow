import { describe, expect, it } from "vitest";
import { buildCarouselObjectStorySpec, parseCarouselUrls } from "./carousel";

describe("carrousel Meta", () => {
  it("ne garde que les URL https distinctes de l'image principale, 9 au plus", () => {
    const urls = ["https://a/1.jpg", "http://a/2.jpg", "https://a/1.jpg", "https://a/main.jpg", 42, ...Array.from({ length: 20 }, (_, i) => `https://a/x${i}.jpg`)];
    const parsed = parseCarouselUrls(urls, "https://a/main.jpg");
    expect(parsed[0]).toBe("https://a/1.jpg");
    expect(parsed).not.toContain("http://a/2.jpg");
    expect(parsed).not.toContain("https://a/main.jpg");
    expect(parsed).toHaveLength(9);
  });

  it("retourne une liste vide si la valeur n'est pas un tableau", () => {
    expect(parseCarouselUrls("x")).toEqual([]);
    expect(parseCarouselUrls(null)).toEqual([]);
  });

  it("construit une carte par image avec hash ou URL", () => {
    const spec = buildCarouselObjectStorySpec({ pageId: "1", link: "https://shop", message: "Texte", headline: "Titre", callToAction: "SHOP_NOW", cards: [{ url: "https://a/1.jpg", hash: "abc123" }, { url: "https://a/2.jpg" }] });
    const cards = spec.link_data.child_attachments;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ image_hash: "abc123", name: "Titre", link: "https://shop" });
    expect(cards[1]).toMatchObject({ picture: "https://a/2.jpg" });
    expect(cards[0].call_to_action).toEqual({ type: "SHOP_NOW", value: { link: "https://shop" } });
  });
});
