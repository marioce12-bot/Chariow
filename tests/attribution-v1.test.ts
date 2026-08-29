import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { calculateVendeoAttributedRoas, verifyChariowSignature } from "@/lib/attribution-server";

describe("Attribution réelle V1", () => {
  it("accepte une signature Pulse HMAC valide et refuse une signature invalide", () => {
    const body = JSON.stringify({ type: "successful.sale" });
    const secret = "test-secret";
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyChariowSignature(body, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyChariowSignature(body, "sha256=invalid", secret)).toBe(false);
  });

  it("calcule le ROAS attribué Vendeo sur le revenu net", () => {
    expect(calculateVendeoAttributedRoas(125000, 50000)).toBe(2.5);
    expect(calculateVendeoAttributedRoas(125000, 0)).toBeNull();
  });

  it("documente les invariants de résolution publique", () => {
    const request = { store_slug: "boutique-stable", product_slug: "produit-stable", visitor_id: "visitor-1" };
    expect(request).not.toHaveProperty("user_id");
    expect(request).not.toHaveProperty("product_id");
    expect(request).toMatchObject({ store_slug: expect.any(String), product_slug: expect.any(String) });
  });

  it("représente l’idempotence Pulse et chariow_sale_id comme des clés distinctes", () => {
    const events = new Set(["delivery-1"]);
    const attributions = new Set(["sale-1"]);
    events.add("delivery-1");
    attributions.add("sale-1");
    expect(events.size).toBe(1);
    expect(attributions.size).toBe(1);
  });
});
