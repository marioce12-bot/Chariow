import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient, startWorkflow } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  startWorkflow: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("workflow/api", () => ({ start: startWorkflow }));
vi.mock("@/lib/studio/video-workflow", () => ({ studioVideoWorkflow: vi.fn() }));

import { POST } from "./route";

const secret = "test-only-reconcile-secret-with-at-least-32-bytes";
function request(body: unknown = { limit: 25 }, suppliedSecret = secret) {
  return new Request("https://example.test/api/cron/studio-video/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-video-reconcile-secret": suppliedSecret },
    body: JSON.stringify(body),
  });
}

function makeAdmin(items: Array<{ generation_id: string; attempts: number }>, rows: Record<string, any>, rpcOverrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_studio_video_reconcile_batch") return { data: items, error: null };
    if (name === "requeue_stale_studio_video_generation") return { data: rpcOverrides.requeue ?? false, error: null };
    if (name === "finish_studio_video_reconcile") return { data: true, error: null };
    return { data: null, error: null };
  });
  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: vi.fn((column: string, value: unknown) => { filters[column] = value; return query; }),
          maybeSingle: async () => ({ data: rows[String(filters.id ?? "")] ?? null, error: null }),
        };
        return query;
      }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STUDIO_VIDEO_RECONCILE_SECRET", secret);
});

describe("studio-video reconciliation endpoint", () => {
  it("rejects missing/wrong secrets before claiming outbox rows", async () => {
    const admin = makeAdmin([], {});
    createAdminClient.mockReturnValue(admin);
    const response = await POST(request({}, "wrong-secret"));
    expect(response.status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("dispatches queued jobs and leaves recent active jobs alone", async () => {
    const now = new Date().toISOString();
    const items = [
      { generation_id: "queued-job", attempts: 1 },
      { generation_id: "active-job", attempts: 1 },
    ];
    const rows = {
      "queued-job": { id: "queued-job", status: "processing", metadata: { phase: "queued", updatedAt: now }, created_at: now },
      "active-job": { id: "active-job", status: "processing", metadata: { phase: "segment0_processing", updatedAt: now }, created_at: now },
    };
    const admin = makeAdmin(items, rows);
    createAdminClient.mockReturnValue(admin);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(startWorkflow).toHaveBeenCalledOnce();
    expect(admin.rpc).toHaveBeenCalledWith("finish_studio_video_reconcile", expect.objectContaining({ p_generation_id: "queued-job", p_outcome: "dispatched" }));
    expect(admin.rpc).toHaveBeenCalledWith("finish_studio_video_reconcile", expect.objectContaining({ p_generation_id: "active-job", p_outcome: "still_active" }));
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("requeues a stale job through the guarded RPC before starting its saved workflow", async () => {
    const job = "stale-job";
    const old = new Date(Date.now() - 25 * 60_000).toISOString();
    const admin = makeAdmin([{ generation_id: job, attempts: 2 }], {
      [job]: { id: job, status: "processing", metadata: { phase: "uncertain", updatedAt: old }, created_at: old },
    }, { requeue: true });
    createAdminClient.mockReturnValue(admin);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("requeue_stale_studio_video_generation", expect.objectContaining({ p_generation_id: job }));
    expect(startWorkflow).toHaveBeenCalledOnce();
  });
});
