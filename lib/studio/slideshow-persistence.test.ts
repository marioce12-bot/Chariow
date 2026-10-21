import { afterEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const storeStudioVideo = vi.fn();
const signedStudioUrl = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }));
vi.mock("@/lib/studio/media", () => ({ storeStudioVideo, signedStudioUrl }));

describe("slideshow final persistence", () => {
  afterEach(() => vi.clearAllMocks());

  it("stores one completed video record with slideshow metadata and existing first-image thumbnail", async () => {
    storeStudioVideo.mockResolvedValue("owner/final-id.mp4");
    signedStudioUrl.mockResolvedValue("signed://final");
    insert.mockResolvedValue({ error: null });
    const { uploadAndInsert } = await import("@/lib/studio/slideshow-server");
    const result = await uploadAndInsert("owner", "final-id", Buffer.from("mp4"), ["img-1", "img-2"], 10, "", "no music", "owner/img-1.png");

    expect(storeStudioVideo).toHaveBeenCalledWith(expect.objectContaining({ contentType: "video/mp4" }), "owner", "final-id");
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({ id: "final-id", user_id: "owner", kind: "video", status: "completed", storage_path: "owner/final-id.mp4", credits_cost: 0, options: { type: "slideshow", duration: 10 }, metadata: { type: "slideshow", imageGenerationIds: ["img-1", "img-2"], parentGenerationId: "img-1", thumbnailStoragePath: "owner/img-1.png" } });
    expect(row.metadata).not.toHaveProperty("backgroundTaskId");
    expect(result).toMatchObject({ generationId: "final-id", videoUrl: "signed://final", creditsCost: 0 });
  });

  it("associates an optional background task without turning the final into a task row", async () => {
    storeStudioVideo.mockResolvedValue("owner/final-id.mp4");
    signedStudioUrl.mockResolvedValue("signed://final");
    insert.mockResolvedValue({ error: null });
    const { uploadAndInsert } = await import("@/lib/studio/slideshow-server");
    await uploadAndInsert("owner", "final-id", Buffer.from("mp4"), ["img-1", "img-2"], 10, "", "no music", "owner/img-1.png", "task-1");
    const row = insert.mock.calls[0][0];
    expect(row.kind).toBe("video");
    expect(row.options.type).toBe("slideshow");
    expect(row.metadata.backgroundTaskId).toBe("task-1");
    expect(row.metadata.parentGenerationId).toBe("img-1");
  });
});
