import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn() }));
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
function event(id: string, status: string, amount: number, currency: string, metadata: Record<string, unknown>) {
  return { event: "transaction.success", data: { id, status, amount, currency, metadata } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SASPAY_WEBHOOK_SECRET", secret);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "payment_events") return { insert: mocks.insert };
    if (table === "subscriptions") return { update: mocks.update };
    if (table === "profiles") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "user@example.test", full_name: "Test User" }, error: null }) }) }),
    };
    throw new Error(`Unexpected table: ${table}`);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/saspay payment confirmation", () => {
  it.each([
    ["XAF", 1126],
    ["GHS", 812],
    ["NGN", 90000],
    ["USD", 3.75],
  ])("credits a signed successful payment in %s regardless of converted amount", async (currency, amount) => {
    const response = await POST(signedRequest(event("credit-any-currency", "SUCCESS", amount, currency, {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", {
      target_user_id: "user-cm",
      amount: 450,
      payment_id: "credit-any-currency",
      metadata_value: { provider: "saspay", original_amount: amount, original_currency: currency },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_webhook_failure", expect.anything());
  });

  it("activates a signed successful subscription payment in any currency and records the original amount", async () => {
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
      metadata: { provider: "saspay", original_amount: 4.25, original_currency: "USD" },
    }));
    expect(mocks.update).toHaveBeenCalled();
  });

  it("records amount_xof only for XOF transactions", async () => {
    const response = await POST(signedRequest(event("credit-xof", "SUCCESS", 1125, "XOF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", expect.objectContaining({
      metadata_value: { provider: "saspay", amount_xof: 1125, original_amount: 1125, original_currency: "XOF" },
    }));
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
