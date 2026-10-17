import { describe, expect, it } from "vitest";
import { getRecoveryPaymentUrl } from "./product-links";

const product = { id: "p-1", name: "Guide", url: "https://shop.example/guide" };

describe("getRecoveryPaymentUrl", () => {
  it("prefers an explicit payment or checkout URL on the sale", () => {
    expect(getRecoveryPaymentUrl({
      payment_url: "https://pay.example/checkout/abc",
      product_id: "p-1",
    }, [product])).toBe("https://pay.example/checkout/abc");
    expect(getRecoveryPaymentUrl({ payment: { url: "https://pay.example/pay" } })).toBe("https://pay.example/pay");
  });

  it("uses a catalog URL only for an exact product ID", () => {
    expect(getRecoveryPaymentUrl({ product: { id: "p-1" } }, [product])).toBe(product.url);
    expect(getRecoveryPaymentUrl({ product_name: "Guide" }, [product])).toBeNull();
    expect(getRecoveryPaymentUrl({ product_id: "p-10" }, [product])).toBeNull();
  });

  it("rejects insecure, credential-bearing URLs and catalog home fallbacks", () => {
    expect(getRecoveryPaymentUrl({ checkout_url: "http://pay.example/checkout" }, [product])).toBeNull();
    expect(getRecoveryPaymentUrl({ checkout_url: "https://user:pass@pay.example/checkout" }, [product])).toBeNull();
    expect(getRecoveryPaymentUrl({ product_id: "p-1" }, [{ ...product, url: "https://shop.example", urlIsFallback: true }])).toBeNull();
    expect(getRecoveryPaymentUrl({ checkout_url: "https://user:pass@pay.example/checkout", product_id: "missing" })).toBeNull();
  });

  it("does not synthesize a page from a product reference or ID", () => {
    expect(getRecoveryPaymentUrl({ product: { id: "p-1", reference: "my-product" } })).toBeNull();
  });
});
