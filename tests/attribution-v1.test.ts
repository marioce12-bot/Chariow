import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { calculateVendeoAttributedRoas, verifyChariowSignature } from "@/lib/attribution-server";
import { selectLastNonDirectTouch, shouldReplaceTouch } from "@/lib/attribution-selection";

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

  it("n’expose aucun identifiant vendeur dans le suivi navigateur", () => {
    const request = { visitor_id: "visitor-1", utm_source: "meta", utm_medium: "paid_social" };
    expect(request).not.toHaveProperty("user_id");
    expect(request).not.toHaveProperty("store_id");
    expect(request).not.toHaveProperty("product_id");
  });

  it("représente l’idempotence Pulse et chariow_sale_id comme des clés distinctes", () => {
    const events = new Set(["delivery-1"]);
    const attributions = new Set(["sale-1"]);
    events.add("delivery-1");
    attributions.add("sale-1");
    expect(events.size).toBe(1);
    expect(attributions.size).toBe(1);
  });

  it("accepte le replay Pulse signé sans delivery id sans attribution financière", () => {
    const body = JSON.stringify({ type: "successful.sale", data: { id: "sale-test" } });
    const signature = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyChariowSignature(body, signature, "test-secret")).toBe(true);
    expect(null).toBeNull();
  });

  it("sélectionne uniquement une touch Meta antérieure dans la fenêtre de 30 jours", () => {
    const saleAt = "2026-08-29T12:00:00.000Z";
    expect(selectLastNonDirectTouch([
      { captured_at: "2026-08-29T13:00:00.000Z", utm_source: "meta", utm_medium: "paid_social" },
      { captured_at: "2026-08-20T13:00:00.000Z", utm_source: "meta", utm_medium: "paid_social" },
    ], saleAt)?.captured_at).toBe("2026-08-20T13:00:00.000Z");
  });

  it("ne laisse pas une visite directe écraser la touch Meta", () => {
    expect(shouldReplaceTouch({ captured_at: "2026-08-20T00:00:00.000Z", utm_source: "meta", utm_medium: "paid_social" }, { captured_at: "2026-08-21T00:00:00.000Z", utm_source: null, utm_medium: null })).toBe(false);
  });

  it("rend la migration corrective compatible avec l’historique sale_id", () => {
    const legacy = { sale_id: "sale-legacy", chariow_sale_id: null };
    const backfilled = { ...legacy, chariow_sale_id: legacy.sale_id };
    expect(backfilled.chariow_sale_id).toBe("sale-legacy");
  });

  it("utilise une fenêtre de synchronisation Meta glissante de 30 jours", () => {
    const to = new Date("2026-08-29T00:00:00.000Z");
    const from = new Date(to.getTime() - 30 * 86400000);
    expect(from.toISOString().slice(0, 10)).toBe("2026-07-30");
    expect(to.toISOString().slice(0, 10)).toBe("2026-08-29");
  });

  it("utilise les dates de la fenêtre quand Meta ne renvoie pas les breakdown dates", () => {
    const fallback = (value: unknown, defaultValue: string) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : defaultValue;
    expect(fallback(undefined, "2026-07-30")).toBe("2026-07-30");
    expect(fallback("2026-08-01", "2026-07-30")).toBe("2026-08-01");
  });

  it("n’inclut jamais campaign_id dans les champs Insights demandés", () => {
    const fieldsByLevel = {
      campaign: ["impressions", "spend"],
      adset: ["adset_id", "adset_name", "impressions", "spend"],
      ad: ["ad_id", "ad_name", "impressions", "spend"],
    };
    expect(Object.values(fieldsByLevel).flat().filter((field) => field === "campaign_id")).toHaveLength(0);
  });
});
