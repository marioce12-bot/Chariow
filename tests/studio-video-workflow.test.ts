import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";

type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createFalVideo: vi.fn(),
  getFalVideoUrl: vi.fn(),
  getFalQueueUtilityFileUrl: vi.fn(),
  importRemoteVideo: vi.fn(),
  deleteCloudinaryAsset: vi.fn(),
  getFalVideoJob: vi.fn(),
  downloadFalVideo: vi.fn(),
  submitFalQueueUtility: vi.fn(),
  downloadFalQueueUtilityFile: vi.fn(),
  storeStudioVideoArtifact: vi.fn(),
  deleteStudioVideoArtifacts: vi.fn(),
  readStudioVideoArtifact: vi.fn(),
  storeStudioVideo: vi.fn(),
  signedStudioUrl: vi.fn(),
  packagedVideoBinaries: vi.fn(),
  probeVideoFile: vi.fn(),
  validateFinalPortraitVideo: vi.fn(),
  assembleVideo: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/ai/fal", () => ({
  createFalVideo: mocks.createFalVideo,
  getFalVideoUrl: mocks.getFalVideoUrl,
  getFalQueueUtilityFileUrl: mocks.getFalQueueUtilityFileUrl,
  getFalVideoJob: mocks.getFalVideoJob,
  downloadFalVideo: mocks.downloadFalVideo,
  submitFalQueueUtility: mocks.submitFalQueueUtility,
  downloadFalQueueUtilityFile: mocks.downloadFalQueueUtilityFile,
  FAL_EXTRACT_FRAME_ENDPOINT: "fal-ai/ffmpeg-api/extract-frame",
  FAL_MERGE_VIDEOS_ENDPOINT: "fal-ai/ffmpeg-api/merge-videos",
}));
vi.mock("@/lib/studio/cloudinary-media", () => ({
  importFalMediaToCloudinary: mocks.importRemoteVideo,
  deleteCloudinaryStudioAsset: mocks.deleteCloudinaryAsset,
  isCloudinaryStudioPath: (path: string) => path.startsWith("cloudinary-private:"),
}));
vi.mock("@/lib/studio/video-assembly", () => ({ assembleVideo: mocks.assembleVideo, extractLastFrame: vi.fn() }));
vi.mock("@/lib/studio/video-runtime", () => ({ packagedVideoBinaries: mocks.packagedVideoBinaries }));
vi.mock("@/lib/studio/video-probe", () => ({ probeVideoFile: mocks.probeVideoFile, validateFinalPortraitVideo: mocks.validateFinalPortraitVideo }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedStudioUrl, storeStudioVideo: mocks.storeStudioVideo }));
vi.mock("@/lib/studio/video-artifacts", () => ({
  deleteStudioVideoArtifacts: mocks.deleteStudioVideoArtifacts,
  readStudioVideoArtifact: mocks.readStudioVideoArtifact,
  storeStudioVideoArtifact: mocks.storeStudioVideoArtifact,
}));

import { assembleAndFinalizeVideoStep, claimVideoWorkflowStep, failVideoWorkflowStep, storeVideoSegmentStep, studioVideoWorkflow, submitVideoContinuityFrameStep, submitVideoMergeStep, submitVideoSegmentStep } from "@/lib/studio/video-workflow";
import { FalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";

const generationId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const transactionId = "22222222-2222-4222-8222-222222222222";
let rows: Map<string, Row>;
let transactions: Map<string, string>;
let partialRefunds: Map<string, { credits: number; user_id: string }>;
let admin: any;

function matches(row: Row, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([column, value]) => {
    if (column.startsWith("metadata->>")) return row.metadata?.[column.slice("metadata->>".length)] === value;
    return row[column] === value;
  });
}

function makeAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table === "credit_transactions") {
        return {
          select: vi.fn(() => {
            const filters: Record<string, unknown> = {};
            const query = {
              eq(column: string, value: unknown) { filters[column] = value; return query; },
              maybeSingle: async () => {
                const externalId = String(filters.external_id ?? "");
                if (externalId) {
                  const refund = partialRefunds.get(externalId);
                  return { data: refund ? { ...refund, id: "refund-id" } : null, error: null };
                }
                const id = String(filters.id ?? "");
                const status = transactions.get(id);
                return { data: status ? { status, credits: 750, user_id: userId } : null, error: null };
              },
            };
            return query;
          }),
        };
      }
      if (table !== "studio_generations") throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          const query = {
            eq(column: string, value: unknown) { filters[column] = value; return query; },
            maybeSingle: async () => {
              const row = [...rows.values()].find(candidate => matches(candidate, filters));
              return { data: row ? structuredClone(row) : null, error: null };
            },
          };
          return query;
        }),
        update: vi.fn((values: Row) => {
          const filters: Record<string, unknown> = {};
          const query: any = {
            eq(column: string, value: unknown) { filters[column] = value; return query; },
            select() { return query; },
            maybeSingle: async () => {
              const row = [...rows.values()].find(candidate => matches(candidate, filters));
              if (!row) return { data: null, error: null };
              Object.assign(row, structuredClone(values));
              return { data: { id: row.id }, error: null };
            },
          };
          return query;
        }),
      };
    }),
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "refund_credit_debit" && typeof args?.transaction_id === "string") transactions.set(args.transaction_id, "refunded");
      if (name === "refund_studio_video_partial" && typeof args?.p_transaction_id === "string" && typeof args.p_idempotency_key === "string" && typeof args.p_refund_credits === "number") {
        partialRefunds.set(args.p_idempotency_key, { credits: args.p_refund_credits, user_id: userId });
        transactions.set(args.p_transaction_id, "completed");
        return { data: { ok: true, refunded_credits: args.p_refund_credits }, error: null };
      }
      if (name === "complete_credit_debit" && typeof args?.transaction_id === "string") transactions.set(args.transaction_id, "completed");
      return name === "set_studio_video_quota_state" ? { data: { ok: true }, error: null } : { data: true, error: null };
    }),
  };
}

function makeRow(overrides: Row = {}) {
  return {
    id: generationId,
    user_id: userId,
    status: "processing",
    storage_path: null,
    credit_transaction_id: transactionId,
    credits_cost: 750,
    metadata: {
      phase: "running",
      resolution: "480p",
      aspectRatio: "9:16",
      initialReferenceUrl: null,
      continuityFramePath: "user/video-work/generation/continuity-frame.png",
      continuityFrameState: "pending",
      mergeState: "pending",
      segment0State: "pending",
      segment1State: "pending",
      plan: {
        duration: 25,
        aspectRatio: "9:16",
        direction: "conversation",
        continuity: "same scene",
        segments: [
          { index: 0, duration: 15, prompt: "segment zero prompt" },
          { index: 1, duration: 10, prompt: "segment one prompt" },
        ],
      },
      updatedAt: new Date().toISOString(),
      ...(overrides.metadata ?? {}),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("FAL_WEBHOOK_URL", "");
  rows = new Map([[generationId, makeRow()]]);
  transactions = new Map([[transactionId, "pending"]]);
  partialRefunds = new Map();
  admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createFalVideo.mockReset().mockResolvedValue("xai/grok-imagine-video/v1.5/text-to-video::provider-job");
  mocks.getFalVideoUrl.mockReset().mockResolvedValue("https://v3.fal.media/files/generated-video.mp4");
  mocks.getFalQueueUtilityFileUrl.mockReset().mockResolvedValue("https://v3.fal.media/files/merged-video.mp4");
  mocks.importRemoteVideo.mockReset().mockImplementation(async (_url: string, _user: string, _id: string, _type: string, segmentIndex?: number) => segmentIndex === undefined ? "cloudinary-private:final" : `cloudinary-private:segment-${segmentIndex}`);
  mocks.deleteCloudinaryAsset.mockReset().mockResolvedValue(undefined);
  mocks.getFalVideoJob.mockReset().mockResolvedValue({ status: "completed" });
  mocks.downloadFalVideo.mockReset().mockResolvedValue({ body: Buffer.from([1, 2, 3]), contentType: "video/mp4" });
  mocks.submitFalQueueUtility.mockReset().mockImplementation(async (endpoint: string) => `${endpoint}::provider-util-job`);
  mocks.downloadFalQueueUtilityFile.mockReset().mockImplementation(async (_jobId: string, kind: "video" | "image") => ({ body: Buffer.from([1, 2, 3]).buffer, contentType: kind === "video" ? "video/mp4" : "image/png" }));
  mocks.storeStudioVideoArtifact.mockReset().mockImplementation(async (_user: string, _id: string, filename: string) => `temp/${filename}`);
  mocks.deleteStudioVideoArtifacts.mockReset().mockResolvedValue(undefined);
  mocks.readStudioVideoArtifact.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  mocks.storeStudioVideo.mockReset().mockResolvedValue("user/final.mp4");
  mocks.signedStudioUrl.mockReset().mockResolvedValue("https://storage.example/signed-asset");
  mocks.packagedVideoBinaries.mockReset().mockReturnValue({ ffmpegPath: "/mock/ffmpeg", ffprobePath: "/mock/ffprobe" });
  mocks.probeVideoFile.mockReset().mockResolvedValue({ duration: 25, width: 720, height: 1280, hasAudio: true, audioDuration: 25 });
  mocks.validateFinalPortraitVideo.mockReset().mockImplementation((probe: Row, expectedDuration = 25) => {
    if (Math.abs(probe.duration - expectedDuration) > 0.4 || probe.width / probe.height !== 9 / 16 || !probe.hasAudio || probe.audioDuration + 0.1 < expectedDuration - 1) throw new Error("invalid merged video");
  });
  mocks.assembleVideo.mockReset().mockImplementation(async (_clips: unknown, _plan: unknown, options: { outputPath: string }) => writeFile(options.outputPath, Buffer.from([1, 2, 3])));
});

describe("durable Studio video workflow claims", () => {
  it("allows the first queued dispatch and rejects an independent duplicate workflow", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    expect(await claimVideoWorkflowStep(generationId)).toBe(true);
    expect(rows.get(generationId)?.metadata.phase).toBe("running");
    expect(await claimVideoWorkflowStep(generationId)).toBe(false);
  });

  it("submits each 25-second segment only once, even if the step is invoked again", async () => {
    const first = await submitVideoSegmentStep(generationId, 0);
    const replay = await submitVideoSegmentStep(generationId, 0);
    expect(first).toBe("xai/grok-imagine-video/v1.5/text-to-video::provider-job");
    expect(replay).toBe(first);
    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(rows.get(generationId)?.metadata).toMatchObject({ segment0JobId: first, segment0FalEndpoint: "xai/grok-imagine-video/v1.5/text-to-video", segment0FalRequestId: "provider-job" });
    expect(mocks.createFalVideo).toHaveBeenCalledWith("segment zero prompt", {
      duration: 15,
      resolution: "480p",
      aspectRatio: "9:16",
      referenceUrl: undefined,
    });
  });

  it("runs a 10-second generation as one provider clip without continuity or merge jobs", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    row.metadata.plan = { duration: 10, aspectRatio: "9:16", direction: "conversation", continuity: "same scene", segments: [{ index: 0, duration: 10, prompt: "ten-second prompt" }] };
    row.metadata.segment1State = "not_required";
    row.metadata.continuityFrameState = "not_required";
    row.metadata.mergeState = "not_required";
    mocks.probeVideoFile.mockResolvedValue({ duration: 10, width: 720, height: 1280, hasAudio: true, audioDuration: 10 });

    await studioVideoWorkflow(generationId);

    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.createFalVideo).toHaveBeenCalledWith("ten-second prompt", expect.objectContaining({ duration: 10 }));
    expect(mocks.submitFalQueueUtility).not.toHaveBeenCalled();
    expect(row.status).toBe("completed");
  });

  it("attaches the signed Fal callback only to one-clip plans and persists its request id", async () => {
    const row = rows.get(generationId)!;
    row.metadata.plan = { duration: 15, aspectRatio: "9:16", direction: "conversation", continuity: "same scene", segments: [{ index: 0, duration: 15, prompt: "fifteen-second prompt" }] };
    vi.stubEnv("FAL_WEBHOOK_URL", "https://www.vendeo-studio.site/api/webhooks/fal");
    await submitVideoSegmentStep(generationId, 0);
    expect(mocks.createFalVideo).toHaveBeenCalledWith("fifteen-second prompt", expect.objectContaining({ duration: 15 }), "https://www.vendeo-studio.site/api/webhooks/fal");
    expect(row.provider_request_id).toBe("provider-job");
  });

  it("uses the saved continuity frame and the 10-second second segment", async () => {
    await submitVideoSegmentStep(generationId, 1);
    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.createFalVideo).toHaveBeenCalledWith("segment one prompt", {
      duration: 10,
      resolution: "480p",
      aspectRatio: "9:16",
      referenceUrl: "https://storage.example/signed-asset",
    });
  });

  it("reconstructs a persisted endpoint/request_id pair after interruption without reposting", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "submitting";
    delete row.metadata.segment0JobId;
    row.metadata.segment0FalEndpoint = "xai/grok-imagine-video/v1.5/text-to-video";
    row.metadata.segment0FalRequestId = "provider-request-12345";
    const recovered = await submitVideoSegmentStep(generationId, 0);
    expect(recovered).toBe("xai/grok-imagine-video/v1.5/text-to-video::provider-request-12345");
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("rejects a result GET whose Fal request belongs to a different segment", async () => {
    await submitVideoSegmentStep(generationId, 0);
    await expect(storeVideoSegmentStep(generationId, 1, "xai/grok-imagine-video/v1.5/text-to-video::provider-job"))
      .rejects.toThrow("STUDIO_VIDEO_SEGMENT_JOB_MISMATCH");
    expect(mocks.downloadFalVideo).not.toHaveBeenCalled();
    expect(mocks.storeStudioVideoArtifact).not.toHaveBeenCalled();
  });

  it("submits the last-frame utility once and reuses its saved Fal job ID", async () => {
    const row = rows.get(generationId)!;
    row.metadata.continuityFramePath = null;
    row.metadata.continuityFrameState = "pending";
    row.metadata.segment0StoragePath = "temp/segment-0.mp4";
    const first = await submitVideoContinuityFrameStep(generationId);
    const replay = await submitVideoContinuityFrameStep(generationId);
    expect(first).toBe("fal-ai/ffmpeg-api/extract-frame::provider-util-job");
    expect(replay).toBe(first);
    expect(rows.get(generationId)?.metadata).toMatchObject({ continuityFrameFalEndpoint: "fal-ai/ffmpeg-api/extract-frame", continuityFrameFalRequestId: "provider-util-job" });
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledOnce();
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledWith("fal-ai/ffmpeg-api/extract-frame", {
      video_url: "https://storage.example/signed-asset",
      frame_type: "last",
    });
  });

  it("submits Fal merge-videos once with the ordered signed clips", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0StoragePath = "temp/segment-0.mp4";
    row.metadata.segment1StoragePath = "temp/segment-1.mp4";
    const first = await submitVideoMergeStep(generationId);
    const replay = await submitVideoMergeStep(generationId);
    expect(first).toBe("fal-ai/ffmpeg-api/merge-videos::provider-util-job");
    expect(replay).toBe(first);
    expect(rows.get(generationId)?.metadata).toMatchObject({ mergeFalEndpoint: "fal-ai/ffmpeg-api/merge-videos", mergeFalRequestId: "provider-util-job" });
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledOnce();
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledWith("fal-ai/ffmpeg-api/merge-videos", {
      video_urls: ["https://storage.example/signed-asset", "https://storage.example/signed-asset"],
      resolution_aspect_ratio_video_index: 0,
    });
  });

  it("imports the Fal merge result directly into Cloudinary without downloading video bytes", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "completed";
    row.metadata.segment1State = "completed";
    row.metadata.segment0StoragePath = "cloudinary-private:segment-0";
    row.metadata.segment1StoragePath = "cloudinary-private:segment-1";
    row.metadata.mergeJobId = "fal-ai/ffmpeg-api/merge-videos::fal-merge-job";
    row.metadata.mergeFalEndpoint = "fal-ai/ffmpeg-api/merge-videos";
    row.metadata.mergeFalRequestId = "fal-merge-job";
    const stored = await assembleAndFinalizeVideoStep(generationId, "fal-ai/ffmpeg-api/merge-videos::fal-merge-job");
    expect(stored).toBe("cloudinary-private:final");
    expect(mocks.importRemoteVideo).toHaveBeenCalledWith("https://v3.fal.media/files/merged-video.mp4", userId, generationId, "video");
    expect(mocks.downloadFalQueueUtilityFile).not.toHaveBeenCalledWith(expect.anything(), "video");
    expect(mocks.storeStudioVideo).not.toHaveBeenCalled();
    expect(mocks.assembleVideo).not.toHaveBeenCalled();
    expect(mocks.deleteCloudinaryAsset).toHaveBeenCalledTimes(2);
    expect(row.metadata.mergeMethod).toBe("fal-merge");
    expect(row.status).toBe("completed");
  });

  it("fails closed when the remote Fal merge result cannot be retrieved", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "completed";
    row.metadata.segment1State = "completed";
    row.metadata.segment0StoragePath = "cloudinary-private:segment-0";
    row.metadata.segment1StoragePath = "cloudinary-private:segment-1";
    row.metadata.mergeJobId = "fal-ai/ffmpeg-api/merge-videos::fal-merge-job";
    row.metadata.mergeFalEndpoint = "fal-ai/ffmpeg-api/merge-videos";
    row.metadata.mergeFalRequestId = "fal-merge-job";
    mocks.getFalQueueUtilityFileUrl.mockRejectedValueOnce(new Error("temporary provider failure"));
    await expect(assembleAndFinalizeVideoStep(generationId, "fal-ai/ffmpeg-api/merge-videos::fal-merge-job")).rejects.toThrow("temporary provider failure");
    expect(mocks.downloadFalQueueUtilityFile).not.toHaveBeenCalledWith(expect.anything(), "video");
    expect(mocks.storeStudioVideo).not.toHaveBeenCalled();
    expect(row.status).toBe("processing");
  });

  it("completes the durable two-clip workflow through Fal continuity and remote Cloudinary import", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    row.metadata.continuityFramePath = null;
    row.metadata.continuityFrameState = "pending";
    row.metadata.segment0StoragePath = null;
    row.metadata.segment1StoragePath = null;
    row.metadata.mergeState = "pending";
    mocks.createFalVideo
      .mockResolvedValueOnce("xai/grok-imagine-video/v1.5/text-to-video::segment-zero-request")
      .mockResolvedValueOnce("xai/grok-imagine-video/v1.5/text-to-video::segment-one-request");

    await studioVideoWorkflow(generationId);

    expect(row.status).toBe("completed");
    expect(row.storage_path).toBe("cloudinary-private:final");
    expect(row.metadata.mergeMethod).toBe("fal-merge");
    expect(mocks.createFalVideo).toHaveBeenCalledTimes(2);
    expect(mocks.getFalVideoUrl).toHaveBeenCalledTimes(2);
    expect(mocks.downloadFalVideo).not.toHaveBeenCalled();
    expect(row.metadata).toMatchObject({ segment0FalRequestId: "segment-zero-request", segment1FalRequestId: "segment-one-request" });
    expect(mocks.submitFalQueueUtility).toHaveBeenNthCalledWith(1, "fal-ai/ffmpeg-api/extract-frame", expect.objectContaining({ frame_type: "last" }));
    expect(mocks.submitFalQueueUtility).toHaveBeenNthCalledWith(2, "fal-ai/ffmpeg-api/merge-videos", expect.objectContaining({ video_urls: expect.any(Array) }));
    expect(mocks.downloadFalQueueUtilityFile).toHaveBeenNthCalledWith(1, "fal-ai/ffmpeg-api/extract-frame::provider-util-job", "image");
    expect(mocks.getFalQueueUtilityFileUrl).toHaveBeenCalledWith("fal-ai/ffmpeg-api/merge-videos::provider-util-job", "video");
    expect(mocks.downloadFalQueueUtilityFile).not.toHaveBeenCalledWith(expect.anything(), "video");
    expect(mocks.importRemoteVideo).toHaveBeenCalledTimes(3);
    expect(transactions.get(transactionId)).toBe("completed");
  });

  it("uses a database compare-and-set so parallel calls create at most one paid request", async () => {
    const results = await Promise.all([
      submitVideoSegmentStep(generationId, 0),
      submitVideoSegmentStep(generationId, 0),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
  });

  it("never retries a submission after an ambiguous provider response", async () => {
    mocks.createFalVideo.mockRejectedValueOnce(new Error("simulated network interruption"));
    expect(await submitVideoSegmentStep(generationId, 0)).toBeNull();
    expect(rows.get(generationId)?.metadata.segment0State).toBe("uncertain");
    expect(rows.get(generationId)?.metadata.creditState).toBe("uncertain");
    expect(await submitVideoSegmentStep(generationId, 0)).toBeNull();
    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
  });

  it("does not submit a segment already marked submitting after an interrupted run", async () => {
    rows.get(generationId)!.metadata.segment0State = "submitting";
    expect(await submitVideoSegmentStep(generationId, 0)).toBeNull();
    expect(mocks.createFalVideo).not.toHaveBeenCalled();
  });

  it("refunds only when the provider rejects submission before accepting a job", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    mocks.createFalVideo.mockRejectedValueOnce(new FalVideoInputRejectedError(
      "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
      "HTTP 422 validation rejection during submit",
      422,
    ));

    await studioVideoWorkflow(generationId);

    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.getFalVideoJob).not.toHaveBeenCalled();
    expect(mocks.downloadFalVideo).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith("refund_credit_debit", { transaction_id: transactionId });
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "released" }));
    expect(row.status).toBe("failed");
    expect(row.metadata.segment0State).toBe("rejected");
    expect(row.metadata.creditState).toBe("refunded");
    expect(row.metadata.errorCode).toBe("STUDIO_VIDEO_PROVIDER_INPUT_REJECTED");
    expect(row.metadata.userMessage).toContain("ont été libérés");
  });

  it("refunds only the unused 10-second share when the second segment is rejected after a 15-second clip", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    mocks.createFalVideo
      .mockResolvedValueOnce("xai/grok-imagine-video/v1.5/text-to-video::segment-0-job")
      .mockRejectedValueOnce(new FalVideoInputRejectedError(
        "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
        "HTTP 422 validation rejection during second segment submit",
        422,
      ));

    await studioVideoWorkflow(generationId);

    expect(mocks.createFalVideo).toHaveBeenCalledTimes(2);
    expect(row.metadata.segment0State).toBe("completed");
    expect(row.metadata.segment1State).toBe("rejected");
    expect(admin.rpc).toHaveBeenCalledWith("refund_studio_video_partial", {
      p_transaction_id: transactionId,
      p_refund_credits: 300,
      p_idempotency_key: `studio-video-partial:${transactionId}:${generationId}`,
    });
    expect(transactions.get(transactionId)).toBe("completed");
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "failed_spent" }));
    expect(row.metadata.creditState).toBe("partially_refunded");
    expect(row.metadata.userMessage).toContain("300 crédits ont été remboursés");
    expect(row.metadata.userMessage).toContain("Ne relance pas");
  });

  it("does not refund if a result GET returns 422 after provider acceptance", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    mocks.getFalVideoUrl.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), { status: 422 }));

    await studioVideoWorkflow(generationId);

    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.getFalVideoJob).toHaveBeenCalledOnce();
    expect(mocks.getFalVideoUrl).toHaveBeenCalledOnce();
    expect(mocks.downloadFalVideo).not.toHaveBeenCalled();
    expect(mocks.storeStudioVideoArtifact).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "uncertain" }));
    expect(admin.rpc).not.toHaveBeenCalledWith("refund_credit_debit", expect.anything());
    expect(row.status).toBe("failed");
    expect(row.metadata.segment0State).toBe("submitted");
    expect(row.metadata.creditState).toBe("uncertain");
    expect(row.metadata.errorCode).toBe("STUDIO_VIDEO_UNCERTAIN");
  });

  it("does not refund a pending reservation after local assembly failure", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "completed";
    row.metadata.segment1State = "completed";
    await failVideoWorkflowStep(generationId, "assembly_failed");
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "failed_spent" }));
    expect(admin.rpc).not.toHaveBeenCalledWith("refund_credit_debit", expect.anything());
    expect(row.status).toBe("failed");
    expect(row.metadata.creditState).toBe("uncertain");
  });

  it("refunds a pending reservation only after an explicit terminal provider failure", async () => {
    const row = rows.get(generationId)!;
    await failVideoWorkflowStep(generationId, "provider_failed");
    expect(admin.rpc).toHaveBeenCalledWith("refund_credit_debit", { transaction_id: transactionId });
    expect(row.metadata.creditState).toBe("refunded");
    expect(row.metadata.errorCode).toBe("STUDIO_VIDEO_FAILED");
  });

  it("keeps credits reserved when submission failure remains ambiguous", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    mocks.createFalVideo.mockRejectedValueOnce(new Error("simulated network interruption"));

    await studioVideoWorkflow(generationId);

    expect(row.status).toBe("failed");
    expect(row.metadata.creditState).toBe("uncertain");
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "uncertain" }));
    expect(admin.rpc).not.toHaveBeenCalledWith("refund_credit_debit", expect.anything());
  });

  it("does not refund when the explicit failure reason is uncertain", async () => {
    await failVideoWorkflowStep(generationId, "uncertain");
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "uncertain" }));
    expect(admin.rpc).not.toHaveBeenCalledWith("refund_credit_debit", expect.anything());
    expect(rows.get(generationId)?.metadata.creditState).toBe("uncertain");
  });
});
