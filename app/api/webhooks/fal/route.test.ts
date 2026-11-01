import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  store: vi.fn(),
}));

vi.mock("@/lib/ai/fal-webhook", () => ({
  readFalWebhookBody: async (request: Request) => Buffer.from(await request.text()),
  verifyFalWebhook: mocks.verify,
  FalWebhookVerificationUnavailableError: class FalWebhookVerificationUnavailableError extends Error {},
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/studio/media", () => ({ storeStudioVideoFromUrl: mocks.store }));

import { POST } from "./route";

describe("POST /api/webhooks/fal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "generation-1",
        user_id: "00000000-0000-0000-0000-000000000001",
        kind: "video",
        status: "processing",
        credit_transaction_id: "credit-1",
        metadata: {},
      },
      error: null,
    });
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = mocks.maybeSingle;
    mocks.from.mockReturnValue(query);
  });

  it("rejects a validly signed callback whose user ID is not the generation owner", async () => {
    const request = new Request("https://www.vendeo-studio.site/api/webhooks/fal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fal-webhook-request-id": "request-1",
        "x-fal-webhook-user-id": "00000000-0000-0000-0000-000000000002",
        "x-fal-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-fal-webhook-signature": "0".repeat(128),
      },
      body: JSON.stringify({ request_id: "request-1", status: "ERROR" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
