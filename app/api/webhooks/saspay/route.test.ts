import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/email", () => ({ notifyAdmin: vi.fn(), moneyXOF: (amount: number) => `${amount} XOF` }));
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SASPAY_WEBHOOK_SECRET", secret);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/saspay observability", () => {
  it("records and acknowledges a successful XAF transaction without processing payment", async () => {
    const event = {
      event: "transaction.success",
      data: {
        id: "c20a1efcdc40483ba230fbf7ef8aa9be",
        status: "SUCCESS",
        amount: 1125,
        currency: "XAF",
        metadata: { userId: "user-cm", plan: "starter" },
      },
    };

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, processed: false, reason: "currency_not_xof" });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("record_webhook_failure", {
      p_provider: "saspay",
      p_event: "transaction.success",
      p_transaction_id: "c20a1efcdc40483ba230fbf7ef8aa9be",
      p_reason: "currency_not_xof",
      p_payload: event,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns 500 if the currency mismatch cannot be persisted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "DB_DOWN" } });
    const response = await POST(signedRequest({
      event: "transaction.success",
      data: { id: "tx-unlogged", status: "SUCCESS", amount: 1125, currency: "XAF" },
    }));
    expect(response.status).toBe(500);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
