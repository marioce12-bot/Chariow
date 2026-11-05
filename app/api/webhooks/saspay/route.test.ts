import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/email", () => ({ notifyAdmin: vi.fn(), moneyXOF: (amount: number) => `${amount} XOF` }));
import { POST } from "./route";
import { planAmount } from "@/lib/plans";

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
function event(id: string, amount: number, currency: string, metadata: Record<string, unknown>) {
  return { event: "transaction.success", data: { id, status: "SUCCESS", amount, currency, metadata } };
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

describe("POST /api/webhooks/saspay currency handling", () => {
  it("accepts XAF credits at the exact nominal XOF price and stores equivalent XOF plus original currency", async () => {
    const response = await POST(signedRequest(event("credit-xaf-ok", 1125, "XAF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", {
      target_user_id: "user-cm",
      amount: 450,
      payment_id: "credit-xaf-ok",
      metadata_value: { provider: "saspay", amount_xof: 1125, original_currency: "XAF" },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("record_webhook_failure", expect.anything());
    expect(mocks.from).not.toHaveBeenCalledWith("payment_events");
  });

  it("accepts XAF subscriptions at the exact nominal XOF price and stores original_currency", async () => {
    const amount = planAmount("starter");
    const response = await POST(signedRequest(event("subscription-xaf-ok", amount, "XAF", {
      userId: "user-cm", plan: "starter",
    })));

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "saspay",
      transaction_id: "subscription-xaf-ok",
      user_id: "user-cm",
      plan: "starter",
      status: "approved",
      metadata: { provider: "saspay", amount_xof: amount, original_currency: "XAF" },
    }));
    expect(mocks.insert.mock.calls[0][0].metadata).not.toHaveProperty("currency");
  });

  it("rejects and records XAF credits when the amount does not exactly match the expected price", async () => {
    const response = await POST(signedRequest(event("credit-xaf-bad", 1126, "XAF", {
      userId: "user-cm", type: "studio_credits", credits: 450,
    })));

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", expect.objectContaining({
      p_transaction_id: "credit-xaf-bad",
      p_reason: "credit_payment_validation_failed",
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("records an unsupported currency and returns 200 without processing it", async () => {
    const unsupported = event("payment-ghs", 2000, "GHS", { userId: "user-1", plan: "starter" });
    const response = await POST(signedRequest(unsupported));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, processed: false, reason: "currency_unsupported" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", {
      p_provider: "saspay",
      p_event: "transaction.success",
      p_transaction_id: "payment-ghs",
      p_reason: "currency_unsupported",
      p_payload: unsupported,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("add_credits", expect.anything());
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns 500 if an unsupported currency cannot be persisted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "DB_DOWN" } });
    const response = await POST(signedRequest(event("payment-unknown", 1000, "NGN", { userId: "user-1" })));
    expect(response.status).toBe(500);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
