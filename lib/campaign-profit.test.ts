import { describe, expect, it } from "vitest";
import { calculateCampaignProfit, confidenceFromAttributions } from "./campaign-profit";
const base = { id: "c1", name: "C", currency: "USD", spend: 20, sales: [{ product_id: "p", amount: 100, net_amount: 90, currency: "USD", status: "paid" }], costs: [{ product_id: "p", currency: "USD", unit_cost: 10, fee_per_sale: 2 }], mappingReliable: true, attributionReliable: true, spendComplete: true, salesComplete: true };
describe("campaign profit", () => {
  it("calculates profit and permits one conservative recommendation only with full evidence", () => {
    const result = calculateCampaignProfit(base);
    expect(result.gross).toBe(100);
    expect(result.net).toBe(90);
    expect(result.fees).toBe(10);
    expect(result.unitCosts).toBe(12);
    expect(result.profit).toBe(58);
    expect(result.recommendation).toBe("continue");
    expect(result.cpaThreshold).toBe(78);
  });
  it("never recommends when attribution or costs are not complete", () => {
    expect(calculateCampaignProfit({ ...base, attributionReliable: false }).recommendation).toBe("unknown");
    expect(calculateCampaignProfit({ ...base, spendComplete: false }).recommendation).toBe("unknown");
    expect(calculateCampaignProfit({ ...base, sales: [{ ...base.sales[0], net_amount: null }], salesComplete: false }).recommendation).toBe("unknown");
  });
  it("detects ambiguous attribution of a sale to more than one campaign", () => {
    const result = confidenceFromAttributions([
      { chariow_sale_id: "s", meta_campaign_id: "a", attribution_method: "utm", attribution_confidence: 90 },
      { chariow_sale_id: "s", meta_campaign_id: "b", attribution_method: "click_id", attribution_confidence: 99 },
    ]);
    expect(result.reliable).toBe(false);
    expect(result.saleIds.size).toBe(0);
  });
  it("ne transforme pas un produit manquant, une devise incompatible ou une couverture absente en bénéfice", () => {
    expect(calculateCampaignProfit({...base,sales:[{...base.sales[0],product_id:null}]}).profit).toBeNull();
    expect(calculateCampaignProfit({...base,sales:[{...base.sales[0],currency:"EUR"}]}).profit).toBeNull();
    expect(calculateCampaignProfit({...base,salesComplete:false}).profit).toBeNull();
  });
  it("ne recommande pas d’agir sur un net estimé", () => {
    const result=calculateCampaignProfit({...base,sales:[{...base.sales[0],net_amount:null}]});
    expect(result.recommendation).toBe("unknown"); expect(result.estimated).toBe(true);
  });
});
