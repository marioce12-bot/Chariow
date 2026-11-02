import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn();
  return { requireUser: vi.fn(), query, rpc: vi.fn(), signedUrl: vi.fn() };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => mocks.query, rpc: mocks.rpc }) }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedUrl }));
import { GET } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const generation = {
  id: "00000000-0000-4000-8000-000000000011",
  status: "processing",
  storage_path: null,
  credit_transaction_id: "00000000-0000-4000-8000-000000000021",
  created_at: "2020-01-01T00:00:00.000Z",
  error: null,
};
const call = () => GET(new Request("https://preview.example/api/studio/video/job-1"), { params: Promise.resolve({ jobId: "job-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: userId } });
  mocks.query.maybeSingle.mockResolvedValue({ data: generation, error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "fail_stale_studio_video_generation") return { data: true, error: null };
    return { data: true, error: null };
  });
  mocks.signedUrl.mockResolvedValue("https://signed.example/video.mp4");
});

describe("studio video status and timeout", () => {
  it("requires an authenticated owner before looking up the job", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await call()).status).toBe(401);
    expect(mocks.query.maybeSingle).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested job is not owned by the authenticated user", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(404);
    expect(mocks.query.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("fails stale processing via the lease-aware database RPC and compensates credit and quota", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "job-1", status: "failed", contentUrl: null });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "fail_stale_studio_video_generation", "refund_credit_debit", "release_video_slot",
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("fail_stale_studio_video_generation", expect.objectContaining({
      p_generation_id: generation.id,
      p_error: expect.stringContaining("délai"),
    }));
  });

  it("does not compensate or mark failed if an active callback lease prevents timeout", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.query.maybeSingle
      .mockResolvedValueOnce({ data: generation, error: null })
      .mockResolvedValueOnce({ data: { status: "processing", error: null, storage_path: null }, error: null });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "job-1", status: "processing", contentUrl: null });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("fail_stale_studio_video_generation", expect.any(Object));
  });

  it("keeps timeout state retryable when refund compensation fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fail_stale_studio_video_generation") return { data: true, error: null };
      if (name === "refund_credit_debit") return { data: false, error: { message: "temporary" } };
      return { data: true, error: null };
    });
    expect((await call()).status).toBe(503);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["fail_stale_studio_video_generation", "refund_credit_debit"]);
  });

  it("returns a signed private content URL only for completed generations", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { ...generation, status: "completed", storage_path: `${userId}/video.mp4` }, error: null });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "completed", contentUrl: "https://signed.example/video.mp4" });
    expect(mocks.signedUrl).toHaveBeenCalledWith(`${userId}/video.mp4`, userId);
  });
});
