import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createAdminClient: vi.fn(), signedStudioUrl: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedStudioUrl }));

import { GET as getVideoContent } from "@/app/api/studio/video/[jobId]/content/route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const taskId = "11111111-1111-4111-8111-111111111111";
const requestId = "provider_segment_one";
const providerJobId = "xai/grok-imagine-video/v1.5/text-to-video::provider_segment_one";
let row: Record<string, any>;
let admin: any;

beforeEach(() => {
  vi.clearAllMocks();
  row = {
    id: taskId,
    video_job_id: taskId,
    user_id: userId,
    status: "completed",
    storage_path: "private/video/final.mp4",
    metadata: { segment1JobId: providerJobId, segment1FalEndpoint: "xai/grok-imagine-video/v1.5/text-to-video", segment1FalRequestId: "provider-segment-one" },
  };
  admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq(column: string, value: unknown) { filters[column] = value; return query; },
          like(column: string, value: unknown) { filters[`like:${column}`] = value; return query; },
          maybeSingle: async () => {
            const matches = Object.entries(filters).every(([key, value]) => {
              if (key.startsWith("like:metadata->>")) {
                const field = key.slice("like:metadata->>".length);
                const suffix = (String(value).startsWith("%") ? String(value).slice(1) : String(value)).replace(/\\([\\%_])/g, "$1");
                return typeof row.metadata?.[field] === "string" && row.metadata[field].endsWith(suffix);
              }
              return key.startsWith("metadata->>") ? row.metadata?.[key.slice("metadata->>".length)] === value : row[key] === value;
            });
            return { data: matches ? { ...row } : null, error: null };
          },
        };
        return query;
      }),
    })),
  };
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, response: null });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.signedStudioUrl.mockResolvedValue("https://storage.example/signed-final-video");
});

describe("Studio video content lookup", () => {
  it("resolves the second Fal segment to the owning Vendeo task's final result via GET only", async () => {
    const response = await getVideoContent(new Request(`https://preview.example/api/studio/video/${encodeURIComponent(providerJobId)}/content`), {
      params: Promise.resolve({ jobId: providerJobId }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example/signed-final-video");
    expect(mocks.signedStudioUrl).toHaveBeenCalledWith("private/video/final.mp4");
  });

  it("resolves a request_id-only result lookup from the legacy composite reference", async () => {
    delete row.metadata.segment1FalEndpoint;
    delete row.metadata.segment1FalRequestId;
    const response = await getVideoContent(new Request(`https://preview.example/api/studio/video/${requestId}/content`), {
      params: Promise.resolve({ jobId: requestId }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example/signed-final-video");
    expect(mocks.signedStudioUrl).toHaveBeenCalledWith("private/video/final.mp4");
  });

  it("does not resolve provider references belonging to another user", async () => {
    row.user_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const response = await getVideoContent(new Request(`https://preview.example/api/studio/video/${encodeURIComponent(providerJobId)}/content`), {
      params: Promise.resolve({ jobId: providerJobId }),
    });
    expect(response.status).toBe(404);
    expect(mocks.signedStudioUrl).not.toHaveBeenCalled();
  });
});
