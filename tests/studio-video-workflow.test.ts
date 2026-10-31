import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";

type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createFalVideo: vi.fn(),
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
  getFalVideoJob: mocks.getFalVideoJob,
  downloadFalVideo: mocks.downloadFalVideo,
  submitFalQueueUtility: mocks.submitFalQueueUtility,
  downloadFalQueueUtilityFile: mocks.downloadFalQueueUtilityFile,
  FAL_EXTRACT_FRAME_ENDPOINT: "fal-ai/ffmpeg-api/extract-frame",
  FAL_MERGE_VIDEOS_ENDPOINT: "fal-ai/ffmpeg-api/merge-videos",
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

import { assembleAndFinalizeVideoStep, claimVideoWorkflowStep, failVideoWorkflowStep, studioVideoWorkflow, submitVideoContinuityFrameStep, submitVideoMergeStep, submitVideoSegmentStep } from "@/lib/studio/video-workflow";
import { FalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";

const generationId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const transactionId = "22222222-2222-4222-8222-222222222222";
let rows: Map<string, Row>;
let transactions: Map<string, string>;
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
                const id = String(filters.id ?? "");
                const status = transactions.get(id);
                return { data: status ? { status } : null, error: null };
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
        direction: "visual_story",
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
  rows = new Map([[generationId, makeRow()]]);
  transactions = new Map([[transactionId, "pending"]]);
  admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createFalVideo.mockReset().mockResolvedValue("xai/grok-imagine-video/v1.5/text-to-video::provider-job");
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
  mocks.validateFinalPortraitVideo.mockReset().mockImplementation((probe: Row) => {
    if (Math.abs(probe.duration - 25) > 0.4 || probe.width / probe.height !== 9 / 16 || !probe.hasAudio || probe.audioDuration + 0.1 < 24) throw new Error("invalid merged video");
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
    expect(mocks.createFalVideo).toHaveBeenCalledWith("segment zero prompt", {
      duration: 15,
      resolution: "480p",
      aspectRatio: "9:16",
      referenceUrl: undefined,
    });
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

  it("submits the last-frame utility once and reuses its saved Fal job ID", async () => {
    const row = rows.get(generationId)!;
    row.metadata.continuityFramePath = null;
    row.metadata.continuityFrameState = "pending";
    row.metadata.segment0StoragePath = "temp/segment-0.mp4";
    const first = await submitVideoContinuityFrameStep(generationId);
    const replay = await submitVideoContinuityFrameStep(generationId);
    expect(first).toBe("fal-ai/ffmpeg-api/extract-frame::provider-util-job");
    expect(replay).toBe(first);
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
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledOnce();
    expect(mocks.submitFalQueueUtility).toHaveBeenCalledWith("fal-ai/ffmpeg-api/merge-videos", {
      video_urls: ["https://storage.example/signed-asset", "https://storage.example/signed-asset"],
      resolution_aspect_ratio_video_index: 0,
    });
  });

  it("publishes a valid Fal merge without invoking the FFmpeg fallback", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "completed";
    row.metadata.segment1State = "completed";
    row.metadata.segment0StoragePath = "temp/segment-0.mp4";
    row.metadata.segment1StoragePath = "temp/segment-1.mp4";
    const stored = await assembleAndFinalizeVideoStep(generationId, "fal-merge-job");
    expect(stored).toBe("user/final.mp4");
    expect(mocks.storeStudioVideo).toHaveBeenCalledOnce();
    expect(mocks.assembleVideo).not.toHaveBeenCalled();
    expect(row.metadata.mergeMethod).toBe("fal-merge");
    expect(row.status).toBe("completed");
  });

  it("falls back locally when Fal merge drops audio and validates the final result", async () => {
    const row = rows.get(generationId)!;
    row.metadata.segment0State = "completed";
    row.metadata.segment1State = "completed";
    row.metadata.segment0StoragePath = "temp/segment-0.mp4";
    row.metadata.segment1StoragePath = "temp/segment-1.mp4";
    mocks.probeVideoFile
      .mockResolvedValueOnce({ duration: 25, width: 720, height: 1280, hasAudio: false, audioDuration: 0 })
      .mockResolvedValueOnce({ duration: 15, width: 720, height: 1280, hasAudio: true, audioDuration: 15 })
      .mockResolvedValueOnce({ duration: 10, width: 720, height: 1280, hasAudio: true, audioDuration: 10 })
      .mockResolvedValueOnce({ duration: 25, width: 720, height: 1280, hasAudio: true, audioDuration: 25 });
    const stored = await assembleAndFinalizeVideoStep(generationId, "fal-merge-job");
    expect(stored).toBe("user/final.mp4");
    expect(mocks.assembleVideo).toHaveBeenCalledOnce();
    const options = mocks.assembleVideo.mock.calls[0][2];
    expect(options).toMatchObject({ width: 720, height: 1280, fps: 30 });
    expect(row.metadata.mergeMethod).toBe("local-fallback");
    expect(row.status).toBe("completed");
  });

  it("completes the durable two-clip workflow through Fal continuity, merge, and audio validation", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    row.metadata.continuityFramePath = null;
    row.metadata.continuityFrameState = "pending";
    row.metadata.segment0StoragePath = null;
    row.metadata.segment1StoragePath = null;
    row.metadata.mergeState = "pending";

    await studioVideoWorkflow(generationId);

    expect(row.status).toBe("completed");
    expect(row.storage_path).toBe("user/final.mp4");
    expect(row.metadata.mergeMethod).toBe("fal-merge");
    expect(mocks.createFalVideo).toHaveBeenCalledTimes(2);
    expect(mocks.submitFalQueueUtility).toHaveBeenNthCalledWith(1, "fal-ai/ffmpeg-api/extract-frame", expect.objectContaining({ frame_type: "last" }));
    expect(mocks.submitFalQueueUtility).toHaveBeenNthCalledWith(2, "fal-ai/ffmpeg-api/merge-videos", expect.objectContaining({ video_urls: expect.any(Array) }));
    expect(mocks.downloadFalQueueUtilityFile).toHaveBeenNthCalledWith(1, "fal-ai/ffmpeg-api/extract-frame::provider-util-job", "image");
    expect(mocks.downloadFalQueueUtilityFile).toHaveBeenNthCalledWith(2, "fal-ai/ffmpeg-api/merge-videos::provider-util-job", "video");
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

  it("does not refund the full reservation when the second segment is rejected after the first was generated", async () => {
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
    expect(admin.rpc).not.toHaveBeenCalledWith("refund_credit_debit", expect.anything());
    expect(transactions.get(transactionId)).toBe("pending");
    expect(admin.rpc).toHaveBeenCalledWith("set_studio_video_quota_state", expect.objectContaining({ p_state: "failed_spent" }));
    expect(row.metadata.creditState).toBe("uncertain");
    expect(row.metadata.userMessage).toContain("Les crédits restent réservés");
    expect(row.metadata.userMessage).toContain("Ne relance pas");
  });

  it("does not refund if a result GET returns 422 after provider acceptance", async () => {
    const row = rows.get(generationId)!;
    row.metadata.phase = "queued";
    mocks.downloadFalVideo.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), { status: 422 }));

    await studioVideoWorkflow(generationId);

    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.getFalVideoJob).toHaveBeenCalledOnce();
    expect(mocks.downloadFalVideo).toHaveBeenCalledOnce();
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
