import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  signedStudioUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedStudioUrl }));

import { GET as getVideoStatus } from "@/app/api/studio/video/[jobId]/route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const taskId = "11111111-1111-4111-8111-111111111111";
const storagePath = `${userId}/studio/${taskId}.mp4`;
const contentUrl = "https://storage.example.test/signed-video.mp4";

beforeEach(() => {
  const row = {
    id: taskId,
    user_id: userId,
    video_job_id: taskId,
    status: "completed",
    storage_path: storagePath,
    metadata: { phase: "completed", progress: 100 },
    credits_cost: 750,
    credit_transaction_id: null,
    created_at: "2026-11-01T10:00:00.000Z",
    error: null,
  };
  const query = {
    eq: vi.fn(function (this: typeof query) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const admin = {
    from: vi.fn(() => ({ select: vi.fn(() => query) })),
  };
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, response: null });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.signedStudioUrl.mockReset().mockResolvedValue(contentUrl);
});

describe("Studio completed video status", () => {
  it("returns the signed final file URL when the durable task is completed", async () => {
    const response = await getVideoStatus(new Request(`https://preview.example/api/studio/video/${taskId}`), {
      params: Promise.resolve({ jobId: taskId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ jobId: taskId, status: "completed", progress: 100, contentUrl });
    expect(mocks.signedStudioUrl).toHaveBeenCalledWith(storagePath);
  });
});
