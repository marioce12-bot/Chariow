import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), from: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/ai/fal-webhook", () => ({
  readFalWebhookBody: async (request: Request) => Buffer.from(await request.text()),
  verifyFalWebhook: mocks.verify,
  FalWebhookVerificationUnavailableError: class FalWebhookVerificationUnavailableError extends Error {},
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/studio/media", () => ({ storeStudioVideoFromUrl: mocks.store }));
import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const generation = {
  id: "00000000-0000-4000-8000-000000000011",
  user_id: userId,
  kind: "video",
  status: "processing",
  credit_transaction_id: "00000000-0000-4000-8000-000000000021",
  storage_path: null as string | null,
};

function request(status: "OK" | "ERROR", videoUrl?: string, requestId = "request-1", signedUserId = userId) {
  const body = JSON.stringify({ request_id: requestId, status, ...(videoUrl ? { payload: { video: { url: videoUrl } } } : {}) });
  return new Request("https://www.vendeo-studio.site/api/webhooks/fal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-fal-webhook-request-id": requestId,
      "x-fal-webhook-user-id": signedUserId,
      "x-fal-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "x-fal-webhook-signature": "0".repeat(128),
    },
    body,
  });
}

function claimed(data: Partial<typeof generation> = {}) {
  return { data: { outcome: "claimed", generation: { ...generation, ...data } }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STUDIO_MEDIA_CLOUDINARY_IMPORT", "true");
  mocks.verify.mockResolvedValue(true);
  mocks.store.mockResolvedValue("cloudinary-private:asset");
  mocks.from.mockImplementation(() => {
    let requestId = "";
    const query = {
      eq: vi.fn((_column: string, value: string) => { requestId = value; return query; }),
      maybeSingle: async () => requestId === "request-1"
        ? { data: { id: generation.id, user_id: generation.user_id }, error: null }
        : { data: null, error: null },
    };
    return { select: vi.fn(() => query) };
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_studio_video_callback") return claimed();
    if (name === "release_studio_video_quota_after_refund") return { data: { ok: true }, error: null };
    return { data: true, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("fal.ai callback lifecycle", () => {
  it("rejects an invalid signature before claiming or mutating a generation", async () => {
    mocks.verify.mockResolvedValue(false);
    const response = await POST(request("ERROR"));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the persisted app owner instead of treating fal.ai's signed user id as an app UUID", async () => {
    const response = await POST(request("ERROR", undefined, "request-1", "fal-workspace-id"));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_studio_video_callback", expect.objectContaining({ p_user_id: userId }));
  });

  it("keeps an unknown request id retryable and does not claim it", async () => {
    const response = await POST(request("ERROR", undefined, "unknown-request", "fal-workspace-id"));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("returns a retryable response when another delivery holds the callback lease", async () => {
    mocks.rpc.mockImplementation(async () => ({ data: { outcome: "busy" }, error: null }));
    const response = await POST(request("OK", "https://fal.media/video.mp4"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("rejects conflicting signed terminal outcomes without applying side effects", async () => {
    mocks.rpc.mockImplementation(async () => ({ data: { outcome: "conflict" }, error: null }));
    expect((await POST(request("ERROR"))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("acknowledges a terminal generation as an idempotent duplicate", async () => {
    mocks.rpc.mockImplementation(async () => ({ data: { outcome: "terminal", status: "completed" }, error: null }));
    const response = await POST(request("OK", "https://fal.media/video.mp4"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("refunds credits, releases the dedicated quota, then finalizes an ERROR callback", async () => {
    const response = await POST(request("ERROR"));
    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_studio_video_callback", "refund_credit_debit", "release_studio_video_quota_after_refund", "finish_studio_video_callback",
    ]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_studio_video_callback", expect.objectContaining({
      p_generation_id: generation.id,
      p_lease_token: expect.any(String),
      p_final_status: "failed",
      p_error: expect.stringContaining("fal.ai"),
    }));
  });

  it("imports remotely, persists the asset, then atomically completes credits, quota, and generation", async () => {
    const response = await POST(request("OK", "https://fal.media/video.mp4"));
    expect(response.status).toBe(200);
    expect(mocks.store).toHaveBeenCalledWith("https://fal.media/video.mp4", userId, generation.id);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_studio_video_callback", "record_studio_video_callback_asset", "complete_studio_video_callback",
    ]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_studio_video_callback", expect.objectContaining({
      p_generation_id: generation.id,
      p_lease_token: expect.any(String),
      p_storage_path: "cloudinary-private:asset",
    }));
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("complete_credit_debit");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("complete_video_slot");
  });

  it("reuses an asset persisted by an earlier attempt instead of importing it again", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_studio_video_callback") return claimed({ storage_path: "cloudinary-private:asset" });
      return { data: true, error: null };
    });
    expect((await POST(request("OK", "https://fal.media/video.mp4"))).status).toBe(200);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_studio_video_callback", "complete_studio_video_callback",
    ]);
  });

  it("keeps an expired callback retryable when atomic finalization rejects its lease", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_studio_video_callback") return claimed();
      if (name === "complete_studio_video_callback") return { data: false, error: null };
      return { data: true, error: null };
    });
    const response = await POST(request("OK", "https://fal.media/video.mp4"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_studio_video_callback", "record_studio_video_callback_asset", "complete_studio_video_callback",
    ]);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("complete_credit_debit");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("complete_video_slot");
  });

  it("does not finalize failure when refunding failed, leaving the callback retryable", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_studio_video_callback") return claimed();
      if (name === "refund_credit_debit") return { data: false, error: null };
      return { data: true, error: null };
    });
    expect((await POST(request("ERROR"))).status).toBe(503);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_studio_video_callback", "refund_credit_debit"]);
  });

  it("compensates an OK callback with no video URL", async () => {
    const response = await POST(request("OK"));
    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_studio_video_callback", "refund_credit_debit", "release_studio_video_quota_after_refund", "finish_studio_video_callback",
    ]);
  });
});
