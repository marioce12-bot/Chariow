import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.maybeSingle = vi.fn();
  return {
    requireUser: vi.fn(),
    query,
    findRow: vi.fn(),
    rpc: vi.fn(),
    confirmCreditTransition: vi.fn(),
    signedUrl: vi.fn(),
  };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => mocks.query, rpc: mocks.rpc }) }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedUrl }));
vi.mock("@/lib/studio/credit-rpc", () => ({ confirmCreditTransition: mocks.confirmCreditTransition }));
vi.mock("@/lib/studio/video-job-reference", () => ({
  isStudioVideoTaskReference: () => true,
  findStudioVideoRowForUser: mocks.findRow,
}));
import { GET } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const generation = {
  id: "00000000-0000-4000-8000-000000000011",
  user_id: userId,
  video_job_id: "job-1",
  status: "processing",
  storage_path: null,
  credit_transaction_id: "00000000-0000-4000-8000-000000000021",
  credits_cost: 150,
  created_at: "2020-01-01T00:00:00.000Z",
  error: null,
  metadata: { updatedAt: "2020-01-01T00:00:00.000Z", progress: 40 },
};
const call = () => GET(new Request("https://preview.example/api/studio/video/job-1"), { params: Promise.resolve({ jobId: "job-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: userId } });
  mocks.findRow.mockResolvedValue({ data: generation, error: null });
  mocks.query.maybeSingle.mockResolvedValue({ data: { status: "pending" }, error: null });
  mocks.query.update.mockReturnValue(mocks.query);
  mocks.rpc.mockImplementation(async (name: string) => name === "release_video_slot" ? { data: true, error: null } : { data: true, error: null });
  mocks.confirmCreditTransition.mockResolvedValue(true);
  mocks.signedUrl.mockResolvedValue("https://signed.example/video.mp4");
});

describe("studio video status and timeout", () => {
  it("requires an authenticated owner before looking up the job", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });
    expect((await call()).status).toBe(401);
    expect(mocks.findRow).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested job is not owned by the authenticated user", async () => {
    mocks.findRow.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(404);
    expect(mocks.findRow).toHaveBeenCalledWith(expect.anything(), userId, "job-1", expect.stringContaining("user_id"));
  });

  it("fails stale processing and compensates credit and quota", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: generation.id, status: "failed", creditState: "refunded", contentUrl: null });
    expect(mocks.rpc).toHaveBeenCalledWith("release_video_slot", { p_user_id: userId, p_request_id: generation.id });
    expect(mocks.confirmCreditTransition).toHaveBeenCalledWith(expect.anything(), "refund_credit_debit", generation.credit_transaction_id, expect.objectContaining({ userId, amount: 150 }));
  });

  it("does not compensate or mark failed if the stale update loses its race", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.findRow.mockResolvedValue({ data: { ...generation, metadata: { updatedAt: "2020-01-01T00:00:00.000Z" } }, error: null });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: generation.id, status: "processing", contentUrl: null });
    expect(mocks.confirmCreditTransition).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("release_video_slot", expect.anything());
  });

  it("keeps timeout state retryable when refund compensation fails", async () => {
    mocks.confirmCreditTransition.mockResolvedValue(false);
    expect((await call()).status).toBe(503);
    expect(mocks.confirmCreditTransition).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("release_video_slot", expect.anything());
  });

  it("returns a signed private content URL only for completed generations", async () => {
    mocks.findRow.mockResolvedValue({ data: { ...generation, status: "completed", storage_path: `${userId}/video.mp4`, metadata: {} }, error: null });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "completed", contentUrl: "https://signed.example/video.mp4" });
    expect(mocks.signedUrl).toHaveBeenCalledWith(`${userId}/video.mp4`, userId);
  });
});
