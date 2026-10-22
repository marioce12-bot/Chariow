import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn(), sign: vi.fn(), generate: vi.fn(), render: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.sign }));
vi.mock("@/lib/studio/image-generation", () => ({ generateStudioImage: mocks.generate }));
vi.mock("@/lib/studio/slideshow-server", () => ({ renderSlideshow: mocks.render, preflightSlideshow: vi.fn(), isPreviewEnabled: () => true }));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("next/server", () => ({ after: vi.fn(), NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
import { GET } from "@/app/api/studio/tasks/route";
import { continuationQuote, publicTask, TASK_TYPE } from "@/lib/studio/background-tasks";

const id = "123e4567-e89b-42d3-a456-426614174000";
const otherId = "123e4567-e89b-42d3-a456-426614174001";
const owner = "owner";
function task(extra: any = {}, status = "completed") {
  return { id, user_id: owner, status, created_at: new Date().toISOString(), metadata: {
    type: TASK_TYPE, taskKind: "image", input: { prompt: "private prompt" }, revision: 1,
    phase: status, updatedAt: new Date().toISOString(), progress: 100, message: "Création prête.",
    images: [], stages: [], creditsConsumed: 20, result: { generationId: "child", imageUrl: "https://expired.test/photo" }, ...extra,
  } };
}
function db(rows: any[], children: any[] = [], failChildRead = false) {
  const reads: Array<{ columns: string; filters: Record<string, any>; limit?: number }> = [];
  mocks.from.mockImplementation(() => ({ select: (columns: string) => {
    const read = { columns, filters: {} as Record<string, any>, limit: undefined as number | undefined };
    reads.push(read);
    let ids: string[] | undefined;
    const matching = (source: any[]) => source.filter(row => Object.entries(read.filters).every(([key, value]) => {
      if (key.startsWith("metadata->>")) return row.metadata?.[key.slice(11)] === value;
      return row[key] === value;
    }) && (!ids || ids.includes(row.id)));
    const chain: any = {
      eq: (key: string, value: any) => { read.filters[key] = value; return chain; },
      in: (_key: string, value: string[]) => { ids = value; return chain; },
      order: () => chain,
      limit: async (limit: number) => { read.limit = limit; return { data: matching(columns.includes("created_at") ? rows : children).slice(0, limit), error: null }; },
      maybeSingle: async () => ({ data: failChildRead ? null : matching(children)[0] ?? null, error: failChildRead ? new Error("DB unavailable") : null }),
    };
    return chain;
  } }));
  return reads;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ user: { id: owner }, response: null });
  mocks.sign.mockReset().mockImplementation(async (path: string) => `https://signed.test/${path}`);
});
function noWork() {
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.render).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
}

describe("read-only Studio task status", () => {
  it("scopes a targeted read to one task, its owner and its technical type", async () => {
    const reads = db([task(), { ...task(), id: otherId }, { ...task(), user_id: "another-owner" }], [{ id: "child", user_id: owner, status: "completed", storage_path: "owner/child.png" }]);
    const response = await GET(new Request(`https://preview.test/api/studio/tasks?id=${id}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.tasks).toHaveLength(1);
    expect(reads[0]).toMatchObject({ filters: { id, user_id: owner, "metadata->>type": TASK_TYPE }, limit: 1 });
    expect(body.tasks[0].result.imageUrl).toBe("https://signed.test/owner/child.png");
    expect(JSON.stringify(body)).not.toContain("private prompt");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    noWork();
  });

  it.each(["", "bad-id", `${id}&user_id=another-owner`])("never widens an invalid targeted ID into a list (%s)", async (invalid) => {
    const response = await GET(new Request(`https://preview.test/api/studio/tasks?id=${encodeURIComponent(invalid)}`));
    expect(await response.json()).toEqual({ tasks: [] });
    expect(mocks.from).not.toHaveBeenCalled();
    noWork();
  });

  it("requires authentication before reading task metadata or signing media", async () => {
    mocks.user.mockResolvedValue({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(new Request(`https://preview.test/api/studio/tasks?id=${id}`))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled(); noWork();
  });

  it("isolates an old broken task instead of losing another completed photo", async () => {
    db([{ ...task({ images: {} }), id: otherId }, task()], [{ id: "child", user_id: owner, status: "completed", storage_path: "owner/child.png" }]);
    const response = await GET(new Request("https://preview.test/api/studio/tasks"));
    const { tasks } = await response.json();
    expect(response.status).toBe(200);
    expect(tasks.find((entry: any) => entry.id === otherId)).toMatchObject({ trackingUnavailable: true });
    expect(tasks.find((entry: any) => entry.id === id)).toMatchObject({ status: "completed", result: { imageUrl: "https://signed.test/owner/child.png" } });
    noWork();
  });

  it("keeps completion and retries only a missing signature after a Storage 429", async () => {
    const row = task();
    db([row], [{ id: "child", user_id: owner, status: "completed", storage_path: "owner/child.png" }]);
    mocks.sign.mockRejectedValueOnce(new Error("429 SlowDown"));
    const pending = await publicTask(row);
    expect(pending).toMatchObject({ status: "completed", mediaPending: true, result: { generationId: "child", imageUrl: null } });
    expect(JSON.stringify(pending)).not.toContain("expired.test");
    const ready = await publicTask(row);
    expect(ready).toMatchObject({ status: "completed", result: { imageUrl: "https://signed.test/owner/child.png" } });
    noWork();
  });

  it("recovers a completed photo child after a lost parent write with one signature and no paid work", async () => {
    const row = task({ result: undefined, phase: "running", stages: [{ kind: "image", state: "uncertain", generationId: "child", step: 0 }] }, "processing");
    const reads = db([row], [{ id: "child", user_id: owner, status: "completed", storage_path: "owner/child.png", credits_cost: 20 }]);
    const result = await publicTask(row);
    expect(result).toMatchObject({ status: "completed", result: { generationId: "child", imageUrl: "https://signed.test/owner/child.png", cost: 20 } });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(reads.every(read => read.filters.user_id === owner)).toBe(true);
    noWork();
  });

  it("never recovers a non-completed or another owner's photo", async () => {
    const row = task({ result: undefined, phase: "running", stages: [{ kind: "image", state: "uncertain", generationId: "child", step: 0 }] }, "processing");
    db([row], [{ id: "child", user_id: "another-owner", status: "completed", storage_path: "other/child.png" }, { id: "child", user_id: owner, status: "processing", storage_path: "owner/child.png" }]);
    const result = await publicTask(row);
    expect(result.status).toBe("processing"); expect(result.result).toBeUndefined();
    expect(mocks.sign).not.toHaveBeenCalled(); noWork();
  });

  it("does not resurrect a deleted child from an expired stored link", async () => {
    db([task()]);
    const result = await publicTask(task());
    expect(result.result).toBeNull(); expect(JSON.stringify(result)).not.toContain("expired.test");
    expect(mocks.sign).not.toHaveBeenCalled(); noWork();
  });

  it("does not interpret a failed database read as deletion or allow continuation", async () => {
    const row = task(); db([row], [], true);
    const result = await publicTask(row);
    expect(result).toMatchObject({ trackingUnavailable: true, status: "tracking_unavailable", images: [] });
    expect(continuationQuote(row, result)).toMatchObject({ allowed: false, reason: "TRACKING_UNAVAILABLE" });
    noWork();
  });

  it("refreshes an existing slideshow video URL and its saved metadata", async () => {
    const row = task({ taskKind: "slideshow", result: { generationId: "video", videoUrl: "https://expired.test/video" } });
    db([row], [{ id: "video", user_id: owner, status: "completed", storage_path: "owner/final.mp4", metadata: { type: "slideshow", duration: 30, musicId: "saved-music", attribution: "saved attribution" } }]);
    const result = await publicTask(row);
    expect(result.result).toMatchObject({ videoUrl: "https://signed.test/owner/final.mp4", duration: 30, musicId: "saved-music", attribution: "saved attribution" });
    noWork();
  });
});
