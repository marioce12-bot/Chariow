import { describe, expect, it } from "vitest";
import { catalogHosts, validateConfigForServer } from "./service";

describe("Shopify storefront catalog URL validation", () => {
  it("only allows hostnames extracted from verified HTTPS product URLs", () => {
    const hosts = catalogHosts([
      { id: "1", name: "Item", description: null, price: 9, currency: "USD", image: null, url: "https://store.myshopify.com/products/item" },
      { id: "2", name: "Bad", description: null, price: null, currency: null, image: null, url: "http://evil.example/a" },
    ]);
    expect(hosts).toEqual(["store.myshopify.com"]);
  });

  it("does not treat arbitrary input domains as verified Shopify hosts", () => {
    const config = { shopName: "Test", products: [{ productId: "1", buyUrl: "https://unverified.myshopify.com/products/item", visible: true }] };
    const parsed = validateConfigForServer(config, ["trusted.myshopify.com"]);
    expect(parsed.ok).toBe(false);
  });
});
