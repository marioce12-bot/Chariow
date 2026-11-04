import { describe, expect, it, vi } from "vitest";
import { createSubscriptionCheckout } from "./checkout";

describe("createSubscriptionCheckout", () => {
  it("requests the fixed Vendeo subscription and returns the secure checkout URL", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payment: { url: "https://pay.saspay.me/checkout/abc" } }),
    });

    await expect(createSubscriptionCheckout(fetcher as unknown as typeof fetch)).resolves.toBe("https://pay.saspay.me/checkout/abc");
    expect(fetcher).toHaveBeenCalledWith("/api/subscription/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "starter" }),
    });
  });

  it("surfaces a clean failure when the payment service rejects the request", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Payment unavailable" }),
    });

    await expect(createSubscriptionCheckout(fetcher as unknown as typeof fetch)).rejects.toThrow("Payment unavailable");
  });

  it("rejects insecure or malformed checkout destinations", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payment: { url: "javascript:alert(1)" } }),
    });

    await expect(createSubscriptionCheckout(fetcher as unknown as typeof fetch)).rejects.toThrow("invalid_subscription_checkout_url");
  });
});
