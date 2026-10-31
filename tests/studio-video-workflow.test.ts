import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createFalVideo: vi.fn(),
  getFalVideoJob: vi.fn(),
  downloadFalVideo: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/ai/fal", () => ({
  createFalVideo: mocks.createFalVideo,
  getFalVideoJob: mocks.getFalVideoJob,
  downloadFalVideo: mocks.downloadFalVideo,
}));
vi.mock("@/lib/studio/video-assembly", () => ({ assembleVideo: vi.fn(), extractLastFrame: vi.fn() }));
vi.mock("@/lib/studio/video-runtime", () => ({ packagedVideoBinaries: vi.fn() }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: vi.fn(), storeStudioVideo: vi.fn() }));
vi.mock("@/lib/studio/video-artifacts", () => ({
  deleteStudioVideoArtifacts: vi.fn(),
  readStudioVideoArtifact: vi.fn(),
  storeStudioVideoArtifact: vi.fn(),
}));

import { claimVideoWorkflowStep, submitVideoSegmentStep } from "@/lib/studio/video-workflow";

const generationId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let rows: Map<string, Row>;
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
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

function makeRow(overrides: Row = {}) {
  return {
    id: generationId,
    user_id: userId,
    status: "processing",
    storage_path: null,
    credit_transaction_id: "22222222-2222-4222-8222-222222222222",
    metadata: {
      phase: "running",
      resolution: "480p",
      aspectRatio: "16:9",
      initialReferenceUrl: null,
      continuityFrameUrl: "https://storage.example/frame.png",
      segment0State: "pending",
      segment1State: "pending",
      plan: {
        duration: 25,
        aspectRatio: "16:9",
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
  admin = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createFalVideo.mockReset().mockResolvedValue("xai/grok-imagine-video/v1.5/text-to-video::provider-job");
  mocks.getFalVideoJob.mockReset();
  mocks.downloadFalVideo.mockReset();
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
      aspectRatio: "16:9",
      referenceUrl: undefined,
    });
  });

  it("uses the saved continuity frame and the 10-second second segment", async () => {
    await submitVideoSegmentStep(generationId, 1);
    expect(mocks.createFalVideo).toHaveBeenCalledOnce();
    expect(mocks.createFalVideo).toHaveBeenCalledWith("segment one prompt", {
      duration: 10,
      resolution: "480p",
      aspectRatio: "16:9",
      referenceUrl: "https://storage.example/frame.png",
    });
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
});
