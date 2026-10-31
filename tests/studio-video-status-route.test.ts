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
const legacyVideoJobId = "33333333-3333-4333-8333-333333333333";
let row: Record<string, any>;
let admin: any;

beforeEach(() => {
  row = {
    id: taskId,
    user_id: userId,
    video_job_id: legacyVideoJobId,
    status: "failed",
    storage_path: null,
    credits_cost: 375,
    created_at: "2026-10-31T16:02:27.000Z",
    error: "Le fournisseur a refusé le prompt avant le rendu; les crédits Studio ont été libérés.",
    metadata: {
      phase: "failed",
      progress: 5,
      creditState: "refunded",
      errorCode: "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
      userMessage: "Le fournisseur a refusé le prompt avant le rendu; les crédits Studio ont été libérés.",
    },
  };
  admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq(column: string, value: unknown) { filters[column] = value; return query; },
          maybeSingle: async () => ({
            data: Object.entries(filters).every(([key, value]) => row[key] === value) ? { ...row } : null,
            error: null,
          }),
        };
        return query;
      }),
      update: vi.fn(),
    })),
  };
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, response: null });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.signedStudioUrl.mockReset();
});

describe("Studio video status reporting", () => {
  it("finds the existing row by task ID and reports definitive rejection without a write", async () => {
    const response = await getVideoStatus(new Request("https://preview.example/api/studio/video/" + taskId), {
      params: Promise.resolve({ jobId: taskId }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobId: taskId,
      status: "failed",
      creditState: "refunded",
      errorCode: "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
      error: "Le fournisseur a refusé le prompt avant le rendu; les crédits Studio ont été libérés.",
    });
    expect(admin.from).toHaveBeenCalledTimes(2);
    expect(mocks.signedStudioUrl).not.toHaveBeenCalled();
    expect(admin.from.mock.results.every((result: any) => result.value.update.mock.calls.length === 0)).toBe(true);
  });
});
