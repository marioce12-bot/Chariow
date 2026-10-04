import { describe, expect, it } from "vitest";
import { isConfirmedChariowSaleStatus } from "./sales";

describe("isConfirmedChariowSaleStatus", () => {
  it.each(["completed", "settled", "SETTLED", " Completed "])("reconnaît le statut encaissé %s", (status) => {
    expect(isConfirmedChariowSaleStatus(status)).toBe(true);
  });

  it.each(["pending", "failed", "abandoned", "refunded", null, undefined])("exclut le statut non encaissé %s", (status) => {
    expect(isConfirmedChariowSaleStatus(status)).toBe(false);
  });
});
