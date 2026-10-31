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
const transactionId = "22222222-2222-4222-8222-222222222222";
const legacyVideoJobId = "33333333-3333-4333-8333-333333333333";
let row: Record<string, any>;
let transactionStatus: string;
let admin: any;

beforeEach(() => {
  transactionStatus = "refunded";
  row = {
    id: taskId,
    user_id: userId,
    video_job_id: legacyVideoJobId,
    credit_transaction_id: transactionId,
    status: "failed",
    storage_path: null,
    credits_cost: 375,
    created_at: "2026-10-31T16:02:27.000Z",
    error: "Le suivi de cette génération est incertain. Les crédits restent réservés; ne relance pas la vidéo.",
    metadata: {
      phase: "uncertain",
      progress: 10,
      creditState: "uncertain",
      errorCode: "STUDIO_VIDEO_UNCERTAIN",
      userMessage: "Le suivi de cette génération est incertain. Les crédits restent réservés; ne relance pas la vidéo.",
    },
  };
  admin = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq(column: string, value: unknown) { filters[column] = value; return query; },
          maybeSingle: async () => {
            if (table === "credit_transactions") return { data: { status: transactionStatus }, error: null };
            return {
              data: Object.entries(filters).every(([key, value]) => row[key] === value) ? { ...row } : null,
              error: null,
            };
          },
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
  it("finds the existing task by ID and reports the live refund without writing the row", async () => {
    const response = await getVideoStatus(new Request("https://preview.example/api/studio/video/" + taskId), {
      params: Promise.resolve({ jobId: taskId }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jobId: taskId,
      status: "failed",
      phase: "uncertain",
      creditState: "refunded",
      errorCode: "STUDIO_VIDEO_UNCERTAIN",
      error: "Le suivi de cette génération est incertain. Les crédits ont été libérés; ne relance pas la vidéo.",
    });
    expect(admin.from).toHaveBeenCalledTimes(3);
    expect(mocks.signedStudioUrl).not.toHaveBeenCalled();
    expect(admin.from.mock.results.every((result: any) => result.value.update.mock.calls.length === 0)).toBe(true);
    expect(row.status).toBe("failed");
    expect(row.metadata.creditState).toBe("uncertain");
  });
});
