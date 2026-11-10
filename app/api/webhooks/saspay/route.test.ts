import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/email", () => ({ notifyAdmin: vi.fn() }));
import { POST } from "./route";

const secret = "test-webhook-secret";
function signedRequest(event: unknown) {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return new Request("https://vendeo.example/api/webhooks/saspay", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": signature },
    body: rawBody,
  });
}
function event(
  id: string,
  status: string,
  amount: number | string | undefined,
  currency: string,
  metadata: Record<string, unknown>,
  transactionFields: Record<string, unknown> = {},
) {
  return {
    event: "transaction.success",
    data: {
      id,
      reference: `TXN-${id}`,
      type: "PAIEMENT",
      status,
      amount,
      currency,
      metadata,
      ...transactionFields,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SASPAY_WEBHOOK_SECRET", secret);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === "payment_events") return {
      insert: mocks.insert,
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    };
    if (table === "subscriptions") return { upsert: mocks.upsert };
    if (table === "profiles") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "user@example.test", full_name: "Test User" }, error: null }) }) }),
    };
    throw new Error(`Unexpected table: ${table}`);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/saspay payment confirmation", () => {
  it.each([
    ["ADD_ON", 1153.13, 1125],
    ["DEDUCTED", 1125, 1096.87],
  ])("credits a valid requested XOF amount with normal %s fees", async (mode, charged, netAmount) => {
    const response = await POST(signedRequest(event(
      `credit-${mode}`,
      "SUCCESS",
      1125,
      "XOF",
      { userId: "user-cm", type: "studio_credits", credits: 450 },
      { fee: 28.13, charged, net_amount: netAmount, fee_charge_mode: mode },
    )));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", {
      target_user_id: "user-cm",
      amount: 450,
      payment_id: `credit-${mode}`,
      metadata_value: { provider: "saspay", amount_xof: 1125, provider_amount: 1125, provider_currency: "XOF" },
    });
  });

  it("activates a signed successful subscription payment in any currency and records tariff and provider amounts", async () => {
    const response = await POST(signedRequest(event("subscription-any-currency", "SUCCESS", 4.25, "USD", {
      userId: "user-cm", plan: "starter",
    })));

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "saspay",
      transaction_id: "subscription-any-currency",
      user_id: "user-cm",
      plan: "starter",
      status: "approved",
      metadata: { provider: "saspay", amount_xof: 2000, provider_amount: 4.25, provider_currency: "USD" },
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-cm", status: "active" }), { onConflict: "user_id" });
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });

  it("stores the tariff XOF amount and provider details for credit payments", async () => {
    const response = await POST(signedRequest(event("credit-xof", "SUCCESS", 1125, "XOF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", expect.objectContaining({
      metadata_value: { provider: "saspay", amount_xof: 1125, provider_amount: 1125, provider_currency: "XOF" },
    }));
  });

  it("records an XOF amount mismatch and does not add credits", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(signedRequest(event("credit-xof-diff", "SUCCESS", 999, "XOF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(400);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("provider_amount_differs_from_credit_price"), expect.anything());
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({
      p_transaction_id: "credit-xof-diff",
      p_reason: "credit_amount_mismatch",
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
  });

  it.each([
    ["a foreign currency", "XAF", 1125, "credit_currency_invalid"],
    ["a missing amount", "XOF", undefined, "credit_amount_mismatch"],
  ])("does not add credits for %s", async (_label, currency, amount, reason) => {
    const response = await POST(signedRequest(event("credit-invalid-money", "SUCCESS", amount, currency, {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({ p_reason: reason }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
  });

  it.each([
    ["a missing reference", { reference: undefined }],
    ["a non-payment transaction", { type: "RETRAIT" }],
    ["a missing transaction type", { type: undefined }],
  ])("does not add credits for %s", async (_label, transactionFields) => {
    const response = await POST(signedRequest(event(
      "credit-invalid-identity",
      "SUCCESS",
      1125,
      "XOF",
      { userId: "user-cm", type: "studio_credits", credits: 450 },
      transactionFields,
    )));

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({
      p_reason: "credit_transaction_identity_invalid",
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
  });

  it("does not add credits when the transaction ID is missing", async () => {
    const response = await POST(signedRequest(event("", "SUCCESS", 1125, "XOF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({
      p_transaction_id: "",
      p_reason: "missing_transaction_id",
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
  });

  it("does not save a subscription payment event if subscription upsert fails", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: "DB_DOWN" } });
    const response = await POST(signedRequest(event("subscription-upsert-fails", "SUCCESS", 2000, "XOF", {
      userId: "user-cm", plan: "starter",
    })));
    expect(response.status).toBe(500);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not activate or credit when SasPay status is not SUCCESS", async () => {
    const response = await POST(signedRequest(event("failed-payment", "FAILED", 999999, "USD", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({
      p_transaction_id: "failed-payment",
      p_reason: "credit_payment_validation_failed",
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
