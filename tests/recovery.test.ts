import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  validRecoveryInput,
  validHttpsUrl,
  waLink,
  saleMatch,
  recoveryDraftError,
  type RecoveryCase,
} from "@/lib/recovery";
const base: RecoveryCase = {
  id: "case-1",
  store_id: "store",
  customer_name: null,
  phone: "+221770000000",
  product_name: null,
  amount: 100,
  currency: "XOF",
  abandoned_at: "2026-10-10T00:00:00Z",
  consent_at: "2026-10-10T00:00:00Z",
  consent_source: "checkout checkbox v1",
  status: "sent",
  prepared_at: "2026-10-10T00:00:00Z",
  sent_at: "2026-10-10T00:01:00Z",
  sale_id: null,
  attribution: null,
};
describe("payment recovery safeguards", () => {
  it("explains missing relance details and accepts a complete consented draft", () => {
    expect(recoveryDraftError({})).toMatch(/numéro WhatsApp valide/);
    expect(
      recoveryDraftError({
        phone: "+221770000000",
        abandonedAt: "2026-10-10T00:00:00Z",
        consentSource: "Formulaire client",
        paymentUrl: "",
        consent: true,
      }),
    ).toMatch(/lien de paiement HTTPS/);
    expect(
      recoveryDraftError({
        phone: "+221770000000",
        abandonedAt: "2026-10-10T00:00:00Z",
        consentSource: "Formulaire client",
        paymentUrl: "https://pay.example/x",
        consent: true,
      }),
    ).toBeNull();
  });
  it("normalizes phone and encodes a manual WhatsApp link", () => {
    expect(normalizePhone("+221 77-000-00-00")).toBe("+221770000000");
    expect(waLink("+221770000000", "bonjour test")).toContain(
      "text=bonjour%20test",
    );
  });
  it("requires declared consent, provenance, date, phone and HTTPS payment URL", () => {
    const input = {
      phone: "+221770000000",
      consentSource: "checkout checkbox",
      abandonedAt: "2026-10-10T00:00:00Z",
      paymentUrl: "https://pay.example/x",
      consent: true,
    };
    expect(validRecoveryInput(input)).toBe(true);
    expect(validRecoveryInput({ ...input, consent: false })).toBe(false);
    expect(
      validRecoveryInput({ ...input, paymentUrl: "http://pay.example" }),
    ).toBe(false);
    expect(validRecoveryInput({ ...input, phone: "123" })).toBe(false);
  });
  it("only accepts a real safe HTTPS URL", () => {
    expect(validHttpsUrl("https://merchant.example/pay")).toBe(true);
    expect(validHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(validHttpsUrl("https://user:pass@example.com")).toBe(false);
  });
  it("never matches on amount and date alone nor without identity", () => {
    const sales = [
      {
        chariow_sale_id: "sale-1",
        status: "completed",
        amount: 100,
        currency: "XOF",
        occurred_at: "2026-10-11T00:00:00Z",
        raw_payload: {},
      },
    ];
    expect(saleMatch(base, sales)).toBeNull();
  });
  it("requires event after sent time and client identity for estimated attribution", () => {
    const early = {
      chariow_sale_id: "sale-1",
      status: "completed",
      amount: 100,
      currency: "XOF",
      occurred_at: "2026-10-10T00:00:30Z",
      raw_payload: { phone: "+221770000000" },
    };
    expect(saleMatch(base, [early])).toBeNull();
    const paid = { ...early, occurred_at: "2026-10-11T00:00:00Z" };
    expect(saleMatch(base, [paid])?.attribution).toBe("estimated");
  });
  it("rejects paid statuses and estimated matches without exact currency or product", () => {
    const sale = {
      chariow_sale_id: "s",
      status: "completed",
      amount: 100,
      currency: "XOF",
      occurred_at: "2026-10-11T00:00:00Z",
      raw_payload: { phone: "+221770000000" },
    };
    expect(saleMatch(base, [{ ...sale, status: "paid" }])).toBeNull();
    expect(saleMatch({ ...base, currency: null }, [sale])).toBeNull();
    expect(saleMatch({ ...base, product_name: "ebook" }, [sale])).toBeNull();
    expect(
      saleMatch({ ...base, product_name: "ebook" }, [
        {
          ...sale,
          raw_payload: { phone: "+221770000000", product_name: "ebook" },
        },
      ])?.attribution,
    ).toBe("estimated");
  });
  it("does not infer a match with multiple identity-matched candidates", () => {
    const s = {
      chariow_sale_id: "s",
      status: "completed",
      amount: 100,
      currency: "XOF",
      occurred_at: "2026-10-11T00:00:00Z",
      raw_payload: { phone: "+221770000000" },
    };
    expect(saleMatch(base, [s, { ...s, chariow_sale_id: "s2" }])).toBeNull();
  });
  it("requires exact linked reference after sending for confirmed attribution", () => {
    const c = { ...base, source_sale_id: "sale-ref" };
    expect(
      saleMatch(c, [
        {
          chariow_sale_id: "sale-ref",
          status: "completed",
          occurred_at: "2026-10-11T00:00:00Z",
          raw_payload: {},
        },
      ])?.attribution,
    ).toBe("confirmed");
  });
});

it("requires a non-null case amount even when the matched sale amount is zero", () => {
  const sale = {
    chariow_sale_id: "zero",
    status: "completed",
    amount: 0,
    currency: "XOF",
    occurred_at: "2026-10-11T00:00:00Z",
    raw_payload: { phone: "221770000000" },
  };
  expect(saleMatch({ ...base, amount: null }, [sale])).toBeNull();
});
it("normalizes equivalent phone numbers whether the source includes a plus sign", () => {
  expect(normalizePhone("221 77-000-00-00")).toBe(
    normalizePhone("+221770000000"),
  );
  const sale = {
    chariow_sale_id: "phone",
    status: "completed",
    amount: 100,
    currency: "XOF",
    occurred_at: "2026-10-11T00:00:00Z",
    raw_payload: { phone: "221 77-000-00-00" },
  };
  expect(saleMatch(base, [sale])?.sale.chariow_sale_id).toBe("phone");
});
it("never attributes sales in non-paid statuses", () => {
  const sale = {
    chariow_sale_id: "not-paid",
    amount: 100,
    currency: "XOF",
    occurred_at: "2026-10-11T00:00:00Z",
    raw_payload: { phone: "+221770000000" },
  };
  for (const status of ["pending", "failed", "abandoned", "cancelled"])
    expect(saleMatch(base, [{ ...sale, status }])).toBeNull();
});

describe("payment timestamp attribution", () => {
  const source = {
    chariow_sale_id: "source",
    status: "completed",
    occurred_at: "2026-10-10T00:00:00Z",
    raw_payload: {},
  };
  it("confirms same source created before send when completed after send", () => {
    expect(
      saleMatch({ ...base, source_sale_id: "source" }, [
        { ...source, raw_payload: { completed_at: "2026-10-11T00:00:00Z" } },
      ])?.attribution,
    ).toBe("confirmed");
  });
  it("rejects a payment completed before send even when synchronization is later", () => {
    expect(
      saleMatch({ ...base, source_sale_id: "source" }, [
        {
          ...source,
          updated_at: "2026-10-12T00:00:00Z",
          raw_payload: { payment: { completed_at: "2026-10-10T00:00:30Z" } },
        },
      ]),
    ).toBeNull();
  });
  it("uses valid payment timestamps from nested sale data and falls back to occurred_at", () => {
    const nested = {
      ...source,
      raw_payload: {
        data: { sale: { settlement: { done_at: "2026-10-11T00:00:00Z" } } },
      },
    };
    expect(
      saleMatch({ ...base, source_sale_id: "source" }, [nested])?.attribution,
    ).toBe("confirmed");
    expect(
      saleMatch({ ...base, source_sale_id: "source" }, [source]),
    ).toBeNull();
    const fallback = {
      ...source,
      occurred_at: "2026-10-11T00:00:00Z",
      raw_payload: { completed_at: "not-a-date" },
    };
    expect(
      saleMatch({ ...base, source_sale_id: "source" }, [fallback])?.attribution,
    ).toBe("confirmed");
  });
});
