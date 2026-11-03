import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ugcFixtureResponse } from "@/tests/fixtures/ugc";

type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  requireActiveSubscription: vi.fn(),
  rateLimit: vi.fn(),
  packagedVideoProbe: vi.fn(),
  createFalVideo: vi.fn(),
  start: vi.fn(),
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  studioVideoWorkflow: vi.fn(),
  failQueuedVideoDispatchStep: vi.fn(),
  askText: vi.fn(),
  isStudioVideoEnabled: vi.fn(),
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
vi.mock("@/lib/ai/text", () => ({ askText: mocks.askText }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: mocks.requireActiveSubscription }));
vi.mock("@/lib/shop/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/studio/video-feature", () => ({ isStudioVideoEnabled: mocks.isStudioVideoEnabled }));
vi.mock("@/lib/studio/video-probe-runtime", () => ({ packagedVideoProbe: mocks.packagedVideoProbe }));
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
import { POST as preparePrompt } from "@/app/api/studio/prompt/route";
import { countFalVideoPromptCharacters, FAL_VIDEO_PROMPT_SAFE_MAX_CHARS } from "@/lib/studio/fal-video-contract";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalRenderFlag = process.env.STUDIO_VIDEO_RENDER_ENABLED;
const originalFalKey = process.env.FAL_API_KEY;
const originalCloudinaryImport = process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT;
const originalCloudinaryCloud = process.env.CLOUDINARY_CLOUD_NAME;
const originalCloudinaryKey = process.env.CLOUDINARY_API_KEY;
const originalCloudinarySecret = process.env.CLOUDINARY_API_SECRET;
const originalFalWebhook = process.env.FAL_WEBHOOK_URL;
const originalSigningSecret = process.env.STUDIO_UGC_SIGNING_SECRET;
const requestId = "11111111-1111-4111-8111-111111111111";
const promptFor = (duration: number, marker = "Scénario vidéo UGC", productName = "Tasse en céramique") => {
  const response = ugcFixtureResponse([{ role: "user", content: JSON.stringify({ product: { title: productName, description: "Produit réel pour un scénario de démonstration.", type: /ebook|guide/i.test(productName) ? "ebook" : "physique", category: "" }, options: { duration, language: "français" } }) }]);
  return response.replace("Scénario vidéo UGC", marker);
};
const baseBody = {
  id: requestId,
  prompt: promptFor(25),
  duration: 25,
  resolution: "480p",
  aspectRatio: "9:16",
  videoStyle: "motion_design",
  product: { name: "Tasse en céramique", description: "Un objet en céramique pour boire.", imageUrl: "https://cdn.chariow.com/tasse.png" },
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
    rpc: vi.fn(async (name: string) => name === "reserve_credits" ? { data: reserveResult, error: null } : name === "reserve_studio_video_quota" ? { data: { ok: true, user_daily_used: 1, user_daily_limit: 2 }, error: null } : { data: { ok: true }, error: null }),
  };
}

function request(body: Row) {
  const normalized = { ...body };
  if (normalized.prompt === baseBody.prompt && normalized.duration !== 25) normalized.prompt = promptFor(Number(normalized.duration));
  return new Request("https://preview.example/api/studio/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
}

function enablePreview() {
  process.env.VERCEL_ENV = "preview";
  process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
  process.env.FAL_API_KEY = "test-only-key";
  process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT = "true";
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  process.env.FAL_WEBHOOK_URL = "https://preview.example/api/webhooks/fal";
}

beforeEach(() => {
  process.env.VERCEL_ENV = "preview";
  process.env.STUDIO_VIDEO_RENDER_ENABLED = "true";
  process.env.FAL_API_KEY = "test-only-key";
  rows = new Map();
  insertedRows = [];
  reserveResult = { ok: true, transaction_id: "22222222-2222-4222-8222-222222222222", balance: 500, reserved: 750 };
  admin = makeAdmin();
  mocks.requireUser.mockResolvedValue({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, response: null });
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.requireActiveSubscription.mockResolvedValue(null);
  mocks.rateLimit.mockReturnValue(false);
  mocks.isStudioVideoEnabled.mockResolvedValue(true);
  mocks.packagedVideoProbe.mockReturnValue("/mock/ffprobe");
  process.env.STUDIO_UGC_SIGNING_SECRET = "fake-test-signing-secret-only";
  mocks.askText.mockImplementation((messages: Array<{ content: string }>) => Promise.resolve(ugcFixtureResponse(messages)));
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
  if (originalCloudinaryImport === undefined) delete process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT;
  else process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT = originalCloudinaryImport;
  if (originalCloudinaryCloud === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = originalCloudinaryCloud;
  if (originalCloudinaryKey === undefined) delete process.env.CLOUDINARY_API_KEY;
  else process.env.CLOUDINARY_API_KEY = originalCloudinaryKey;
  if (originalCloudinarySecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
  else process.env.CLOUDINARY_API_SECRET = originalCloudinarySecret;
  if (originalFalWebhook === undefined) delete process.env.FAL_WEBHOOK_URL;
  else process.env.FAL_WEBHOOK_URL = originalFalWebhook;
  if (originalSigningSecret === undefined) delete process.env.STUDIO_UGC_SIGNING_SECRET;
  else process.env.STUDIO_UGC_SIGNING_SECRET = originalSigningSecret;
  vi.clearAllMocks();
});

describe("Studio video Preview generation", () => {
  it("reports bundled runtime readiness without reserving credits or calling the provider", async () => {
    enablePreview();
    const response = await videoReadiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true, storage: "cloudinary-remote-import", provider: true, callback: true, callbackRequiredDurations: [10, 15], assembly: "fal-merge", supportedDurations: [10, 15, 25], aspectRatio: "9:16" });
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("keeps runtime readiness locked in Production", async () => {
    mocks.isStudioVideoEnabled.mockResolvedValue(false);
    const response = await videoReadiness();
    expect(response.status).toBe(423);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("remains locked outside Preview, even if the server flag is present", async () => {
    mocks.isStudioVideoEnabled.mockResolvedValue(false);
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
    expect(result).toMatchObject({ jobId: requestId, status: "processing", cost: 750 });
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ amount: 750, request_id: requestId }));
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ id: requestId, status: "processing", credits_cost: 750, video_job_id: requestId });
    expect(insertedRows[0].metadata).toMatchObject({ phase: "queued", segment0State: "pending", segment1State: "pending", videoStyle: "ugc" });
    for (const segment of insertedRows[0].metadata.plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
    }
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("ignores the legacy Motion Design field and persists UGC without calling Fal", async () => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, videoStyle: "motion_design" }));
    expect(response.status).toBe(202);
    expect(insertedRows[0].metadata.videoStyle).toBe("ugc");
    expect(insertedRows[0].options.videoStyle).toBe("ugc");
    expect(insertedRows[0].metadata.plan.segments[0].prompt).toContain("CLIP 1/2");
    expect(mocks.askText).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("charges exactly 1,300 credits for a 25-second 720p portrait video", async () => {
    enablePreview();
    reserveResult = { ...reserveResult, reserved: 1300 };
    const response = await generateVideo(request({ ...baseBody, resolution: "720p" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ cost: 1300 });
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ amount: 1300, request_id: requestId }));
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it.each(["USER_ACTIVE_LIMIT", "USER_DAILY_LIMIT"] as const)("blocks a user quota response (%s) before reserving credits", async code => {
    enablePreview();
    admin.rpc.mockImplementation(async (name: string) => name === "reserve_studio_video_quota"
      ? { data: { ok: false, code }, error: null }
      : { data: reserveResult, error: null });
    const response = await generateVideo(request(baseBody));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe(code);
    expect(admin.rpc).toHaveBeenCalledOnce();
    expect(insertedRows).toHaveLength(0);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it.each([
    { resolution: "1080p", aspectRatio: "9:16" },
    { resolution: "480p", aspectRatio: "16:9" },
  ])("rejects unpriced or non-portrait options before reservation", async overrides => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, ...overrides }));
    expect(response.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("compiles 15s + 10s prompts safely before reserving credits, even for long product data and brief", async () => {
    enablePreview();
    const description = Array.from({ length: 60 }, (_, index) => `Fait produit ${index + 1}: le guide est disponible au format PDF.`).join(" ").slice(0, 4000);
    const prompt = `${"Mise en scène UGC naturelle avec rythme soutenu. ".repeat(12)}\n${promptFor(25, "Scénario détaillé", "Guide ebook cuisine")}`;
    const response = await generateVideo(request({ ...baseBody, prompt, product: { name: "Guide ebook cuisine", description, imageUrl: "https://cdn.chariow.com/ebook-cover.png" } }));
    expect(response.status).toBe(202);
    expect(insertedRows[0].metadata.plan.segments.map((segment: Row) => segment.duration)).toEqual([15, 10]);
    for (const segment of insertedRows[0].metadata.plan.segments) {
      expect(countFalVideoPromptCharacters(segment.prompt)).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_SAFE_MAX_CHARS);
      expect(segment.prompt).toContain("Guide ebook cuisine");
      expect(segment.prompt).toContain("show the supplied exact ebook cover on a phone/tablet");
      expect(segment.prompt).toContain("casting noir ou métissé");
    }
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ amount: 750, request_id: requestId }));
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("reuses a valid prepared token at render time without extra LLM calls", async () => {
    enablePreview();
    const preparedResponse = await preparePrompt(request({ mediaType: "video", duration: 25, product: baseBody.product }));
    const prepared = await preparedResponse.json();
    expect(preparedResponse.status).toBe(200);
    expect(mocks.askText).toHaveBeenCalledTimes(1);
    mocks.askText.mockClear();
    const render = await generateVideo(request({ ...baseBody, prompt: prepared.prompt, preparedUgc: prepared.preparedUgc }));
    expect(render.status).toBe(202);
    expect(mocks.askText).not.toHaveBeenCalled();
  });

  it("rejects a prompt timeline whose duration differs from the selected duration before quota or credits", async () => {
    enablePreview();
    const stalePrompt = `${promptFor(25)}\nVariation éditée`;
    const response = await generateVideo(request({ ...baseBody, prompt: stalePrompt, duration: 15 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "ugc_duration_mismatch", promptDuration: 25, selectedDuration: 15 });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
    expect(mocks.askText).not.toHaveBeenCalled();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("keeps prompt preparation out of credits and rendering", async () => {
    enablePreview();
    const response = await preparePrompt(request({ mediaType: "video", duration: 25, product: baseBody.product }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(typeof result.prompt).toBe("string");
    expect(result.prompt).toContain("Tasse en céramique");
    expect(mocks.askText).toHaveBeenCalledTimes(1);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it("sanitizes failed prompt preparation without reserving credits", async () => {
    enablePreview();
    mocks.askText.mockRejectedValue(new Error("secret provider failure"));
    const response = await preparePrompt(request({ mediaType: "video", duration: 25, product: baseBody.product }));
    const result = await response.json();
    expect([502, 504]).toContain(response.status);
    expect(result).toMatchObject({ code: "ugc_prompt_generation_failed", error: "Le scénario n’a pas pu être généré, réessaie.", failureRule: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("secret provider failure");
    expect(mocks.askText.mock.calls.length).toBeLessThanOrEqual(3);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it("never invokes text generation from direct render", async () => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, prompt: promptFor(25, "Texte édité par l'utilisateur") }));
    expect(response.status).toBe(202);
    expect(mocks.askText).not.toHaveBeenCalled();
    expect(insertedRows[0].metadata.plan.segments[0].prompt).toContain("Texte édité par l'utilisateur");
  });

  it("uses an edited textarea prompt as plain user input without text-model calls", async () => {
    enablePreview();
    const prompt = promptFor(25, "Texte modifié dans le textarea.");
    const response = await generateVideo(request({ ...baseBody, prompt }));
    expect(response.status).toBe(202);
    expect(mocks.askText).not.toHaveBeenCalled();
    for (const segment of insertedRows[0].metadata.plan.segments) {
      expect(segment.prompt).toContain("Texte modifié dans le textarea.");
      expect(segment.prompt).toContain("CLIP");
    }
  });

  it("defaults to UGC when the legacy style is omitted", async () => {
    enablePreview();
    const { videoStyle: _ignored, ...body } = baseBody;
    expect((await generateVideo(request(body))).status).toBe(202);
    expect(insertedRows[0].metadata.videoStyle).toBe("ugc");
  });

  it("requires an ebook cover before quota or credits are reserved", async () => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, product: { name: "Ebook guide pratique", description: "Disponible en PDF." } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "STUDIO_VIDEO_EBOOK_COVER_REQUIRED" });
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("does not reserve credits or contact a provider if the user has insufficient available credits", async () => {
    enablePreview();
    reserveResult = { ok: false, balance: 300, reserved: 100, required: 750 };
    const response = await generateVideo(request(baseBody));
    const result = await response.json();
    expect(response.status).toBe(402);
    expect(result.code).toBe("INSUFFICIENT_CREDITS");
    expect(result.balance).toBe(200);
    expect(insertedRows).toHaveLength(0);
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("defers local ffprobe readiness to the durable workflow instead of calling Fal inline", async () => {
    enablePreview();
    mocks.packagedVideoProbe.mockReturnValue(null);
    const response = await generateVideo(request(baseBody));
    expect(response.status).toBe(202);
    expect(insertedRows).toHaveLength(1);
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ request_id: requestId }));
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("supports a 15-second single-segment prompt when its provider callback is configured", async () => {
    enablePreview();
    const response = await generateVideo(request({ ...baseBody, duration: 15 }));
    expect(response.status).toBe(202);
    expect(insertedRows[0].metadata.plan.segments.map((segment: Row) => segment.duration)).toEqual([15]);
    expect(admin.rpc).toHaveBeenCalledWith("reserve_credits", expect.objectContaining({ request_id: requestId }));
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("returns an existing request idempotently without a new reservation or provider job", async () => {
    enablePreview();
    rows.set(requestId, { id: requestId, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "processing", video_job_id: requestId, credits_cost: 750, metadata: { progress: 10 } });
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
