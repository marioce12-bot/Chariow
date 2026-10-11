import { describe, expect, it } from "vitest";
import { normalizeChariowSnapshot, serializeChariowContext } from "./analytics";
import type { ChariowStoreSnapshot } from "./types";

const privateEmail = "buyer@example.test";
const privatePhone = "+33123456789";

function sampleSnapshot(): ChariowStoreSnapshot {
  return {
    store: { name: "Boutique test", currency: "XOF", domain: "boutique.example" },
    products: [{ id: "product-1", name: "Livre", price: 5000, currency: "XOF", image: "https://boutique.example/livre.png", url: "https://boutique.example/livre" }],
    sales: [{
      id: "sale-1",
      status: "completed",
      amount: { value: 5000, currency: "XOF" },
      created_at: "2026-10-10T12:00:00.000Z",
      product_id: "product-1",
      product_name: "Livre",
      customer: { id: "customer-1", email: privateEmail, phone: privatePhone },
      email: privateEmail,
      phone: privatePhone,
      payment: { payer_email: privateEmail, payer_phone: privatePhone },
    }],
    storeAnalytics: {
      sales: { count: 1, value: { value: 5000, currency: "XOF" } },
      visits: { total: 20, conversion_rate: { formatted: "5 %" } },
    },
  };
}

describe("Chariow analytics privacy", () => {
  it("returns only an anonymized sale summary to the browser", () => {
    const normalized = normalizeChariowSnapshot(sampleSnapshot(), { from: "2026-10-01", to: "2026-10-11" });
    expect(normalized.sales).toEqual([{
      status: "completed",
      amount: 5000,
      currency: "XOF",
      created_at: "2026-10-10T12:00:00.000Z",
      product_id: "product-1",
      product_name: "Livre",
    }]);
    expect(JSON.stringify(normalized)).not.toContain(privateEmail);
    expect(JSON.stringify(normalized)).not.toContain(privatePhone);
  });

  it("never includes client email or phone in the AI context", () => {
    const context = serializeChariowContext(sampleSnapshot());
    expect(context).not.toContain(privateEmail);
    expect(context).not.toContain(privatePhone);
    expect(context).toContain("Livre");
  });
});
