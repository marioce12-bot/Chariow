import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  requireActiveSubscription: vi.fn(),
  rateLimit: vi.fn(),
  packagedVideoBinaries: vi.fn(),
  createFalVideo: vi.fn(),
  start: vi.fn(),
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  studioVideoWorkflow: vi.fn(),
  failQueuedVideoDispatchStep: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => { mocks.afterCallbacks.push(callback); }),
  };
});
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.requireActiveSubscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/studio/video-runtime", () => ({ packagedVideoBinaries: mocks.packagedVideoBinaries }));
vi.mock("@/lib/ai/fal", () => ({
  getAiVideoTextModel: () => "xai/grok-imagine-video/v1.5/text-to-video",
  getAiVideoImageModel: () => "xai/grok-imagine-video/v1.5/image-to-video",
  createFalVideo: mocks.createFalVideo,
}));
vi.mock("@/lib/studio/video-workflow", () => ({
  studioVideoWorkflow: mocks.studioVideoWorkflow,
  failQueuedVideoDispatchStep: mocks.failQueuedVideoDispatchStep,
}));

import { GET as videoReadiness, POST as generateVideo } from "@/app/api/studio/video/route";
import { countFalVideoPromptCharacters, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS } from "@/lib/studio/fal-video-contract";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalRenderFlag = process.env.STUDIO_VIDEO_RENDER_ENABLED;
const originalFalKey = process.env.FAL_API_KEY;
const requestId = "11111111-1111-4111-8111-111111111111";
const baseBody = {
  id: requestId,
  prompt: "Créer une publicité motion design pour un guide numérique.",
  duration: 25,
  resolution: "480p",
  aspectRatio: "16:9",
  videoStyle: "motion_design",
  product: { name: "Guide numérique", description: "Un guide PDF." },
};
let rows: Map<string, Row>;
let insertedRows: Row[];
let admin: any;
let reserveResult: Row;

function makeAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "studio_generations") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          const query = {
            eq(column: string, value: unknown) { filters[column] = value; return query; },
            maybeSingle: async () => {
              const row = [...rows.values()].find(candidate => Object.entries(filters).every(([column, value]) => candidate[column] === value));
              return { data: row ? { ...row } : null, error: null };
            },
          };
          return query;
        }),
        insert: vi.fn((values: Row) => {
          insertedRows.push(values);
          if (rows.has(values.id)) return { select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "23505" } }) }) };
          rows.set(values.id, { ...values });
          return { select: () => ({ maybeSingle: async () => ({ data: { id: values.id }, error: null }) }) };
        }),
      };
    }),
    rpc: vi.fn(async (name: string) => name === "reserve_credits" ? { data: reserveResult, error: null } : { data: true, error: null }),
  };
}

function request(body: Row) {
  return new Request("https://preview.example/api/studio/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function enablePreview() {
  process.env.VERCEL_ENV = "preview";
  process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
  process.env.FAL_API_KEY = "test-only-key";
}

beforeEach(() => {
  process.env.VERCEL_ENV = "preview";
  process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
  process.env.FAL_API_KEY = "test-only-key";
  rows = new Map();
  insertedRows = [];
  reserveResult = { ok: true, transaction_id: "22222222-2222-4222-8222-222222222222", balance: 500, reserved: 375 };
  admin = makeAdmin();
  mocks.requireUser.mockResolvedValue({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, response: null });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.requireActiveSubscription.mockResolvedValue(null);
  mocks.rateLimit.mockReturnValue(false);
  mocks.packagedVideoBinaries.mockReturnValue({ ffmpegPath: "/mock/ffmpeg", ffprobePath: "/mock/ffprobe" });
  mocks.start.mockResolvedValue({ runId: "mock-run" });
  mocks.studioVideoWorkflow.mockReset();
  mocks.failQueuedVideoDispatchStep.mockReset();
  mocks.afterCallbacks.length = 0;
});

afterEach(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalRenderFlag === undefined) delete process.env.STUDIO_VIDEO_RENDER_ENABLED;
  else process.env.STUDIO_VIDEO_RENDER_ENABLED = originalRenderFlag;
  if (originalFalKey === undefined) delete process.env.FAL_API_KEY;
  else process.env.FAL_API_KEY = originalFalKey;
  vi.clearAllMocks();
});

describe("Studio video Preview generation", () => {
  it("reports bundled runtime readiness without reserving credits or calling the provider", async () => {
    enablePreview();
    const response = await videoReadiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true, binaries: { ffmpeg: true, ffprobe: true }, duration: 25, segmentDurations: [15, 10] });
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("keeps runtime readiness locked in Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
    const response = await videoReadiness();
    expect(response.status).toBe(423);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("remains locked outside Preview, even if the server flag is present", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
    const response = await generateVideo(request(baseBody));
    expect(response.status).toBe(423);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("reserves the exact cost, records a job and schedules only the workflow", async () => {
    enablePreview();
    const response = await generateVideo(request(baseBody));
    const result = await response.json();
    expect(response.status).toBe(202);
    expect(result).toMatchObject({ jobId: requestId, status: "processing", cost: 375 });
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ amount: 375, request_id: requestId }));
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ id: requestId, status: "processing", credits_cost: 375, video_job_id: requestId });
    expect(insertedRows[0].metadata).toMatchObject({ phase: "queued", segment0State: "pending", segment1State: "pending", videoStyle: "motion_design" });
    for (const segment of insertedRows[0].metadata.plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
    }
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it.each(["motion_design", "ugc"] as const)("persists the selected %s style without calling a video provider", async videoStyle => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, videoStyle }));
    expect(response.status).toBe(202);
    expect(insertedRows[0].metadata.videoStyle).toBe(videoStyle);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("compiles 15s + 10s prompts safely before reserving credits, even for long product data and brief", async () => {
    enablePreview();
    const description = Array.from({ length: 60 }, (_, index) => `Fait produit ${index + 1}: le guide est disponible au format PDF.`).join(" ").slice(0, 4000);
    const prompt = "Motion design animé, transitions fluides et rythme soutenu. ".repeat(100).slice(0, 4000);
    const response = await generateVideo(request({ ...baseBody, prompt, product: { name: "Guide ebook cuisine", description } }));
    expect(response.status).toBe(202);
    expect(insertedRows[0].metadata.plan.segments.map((segment: Row) => segment.duration)).toEqual([15, 10]);
    for (const segment of insertedRows[0].metadata.plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
      expect(segment.prompt).toContain("Guide ebook cuisine");
    }
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ amount: 375, request_id: requestId }));
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("defaults to Motion design when the style is omitted", async () => {
    enablePreview();
    const { videoStyle: _ignored, ...body } = baseBody;
    expect((await generateVideo(request(body))).status).toBe(202);
    expect(insertedRows[0].metadata.videoStyle).toBe("motion_design");
  });

  it("does not reserve credits or contact a provider if the user has insufficient available credits", async () => {
    enablePreview();
    reserveResult = { ok: false, balance: 300, reserved: 100, required: 375 };
    const response = await generateVideo(request(baseBody));
    const result = await response.json();
    expect(response.status).toBe(402);
    expect(result.code).toBe("INSUFFICIENT_CREDITS");
    expect(result.balance).toBe(200);
    expect(insertedRows).toHaveLength(0);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("fails closed before reserving if packaged video binaries are unavailable", async () => {
    enablePreview();
    mocks.packagedVideoBinaries.mockReturnValue(null);
    const response = await generateVideo(request(baseBody));
    expect(response.status).toBe(503);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("rejects durations other than the exact 25-second assembled output before reservation", async () => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, duration: 15 }));
    expect(response.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("returns an existing request idempotently without a new reservation or provider job", async () => {
    enablePreview();
    rows.set(requestId, { id: requestId, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "processing", video_job_id: requestId, credits_cost: 375, metadata: { progress: 10 } });
    const response = await generateVideo(request(baseBody));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ jobId: requestId, status: "processing", progress: 10 });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("dispatches the durable workflow only after the response is prepared", async () => {
    enablePreview();
    await generateVideo(request(baseBody));
    await mocks.afterCallbacks[0]();
    expect(mocks.start).toHaveBeenCalledWith(mocks.studioVideoWorkflow, [requestId]);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });
});
