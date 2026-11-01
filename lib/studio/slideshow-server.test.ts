import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRemixSlideshowDuration, isPreviewEnabled, publicTracks, resolveTrackPath } from "@/lib/studio/slideshow-server";

describe("slideshow backend safety", () => {
  const prior = process.env.VERCEL_ENV;
  afterEach(() => {
    if (prior === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prior;
  });

  it("enables the released slideshow on Vercel Preview and Production only", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewEnabled()).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(isPreviewEnabled()).toBe(true);
    process.env.VERCEL_ENV = "development";
    expect(isPreviewEnabled()).toBe(false);
    delete process.env.VERCEL_ENV;
    expect(isPreviewEnabled()).toBe(false);
  });

  it("keeps music remix available for legacy and new slideshow lengths", () => {
    for (const seconds of [5, 10, 25, 30, 40]) expect(isRemixSlideshowDuration(seconds)).toBe(true);
    for (const seconds of [0, 15, 20, 60, "25", null]) expect(isRemixSlideshowDuration(seconds)).toBe(false);
  });

  it("resolves private music only from a fixed id-based bucket path", () => {
    expect(resolveTrackPath("allowed_track-1")).toBe("_licensed-music/allowed_track-1.mp3");
    for (const id of ["../secret", "x/y", "", ".", "a\\b"]) expect(() => resolveTrackPath(id)).toThrow();
  });

  it("never exposes private source filenames or local paths in catalog results", () => {
    for (const track of publicTracks()) {
      expect(track).not.toHaveProperty("fileName");
      expect(track).not.toHaveProperty("localPath");
      expect(track).not.toHaveProperty("downloadUrl");
    }
    expect(publicTracks()).toHaveLength(13);
  });

  it("contains no image/video provider integration or generation calls", async () => {
    const source = await readFile(path.join(process.cwd(), "lib/studio/slideshow-server.ts"), "utf8");
    expect(source).not.toMatch(/@\/lib\/ai\/|generateFal|generateImage|reserveCredits|generateVideo/);
    expect(source).toMatch(/\"-c:v\", \"copy\"/);
  });

  it.each([0,1,2,3,4,6])("rejects %i image ids before filesystem or database I/O", async (count) => {
    const mkdtemp = vi.fn();
    const createAdminClient = vi.fn();
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({ mkdtemp, readFile: vi.fn(), rm: vi.fn(), stat: vi.fn(), writeFile: vi.fn() }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient }));
    vi.doMock("@/lib/studio/slideshow", () => ({ assembleSlideshow: vi.fn() }));
    vi.doMock("@/lib/studio/media", () => ({ storeStudioVideo: vi.fn(), signedStudioUrl: vi.fn() }));
    const server = await import("@/lib/studio/slideshow-server");
    await expect(server.renderSlideshow("owner", Array.from({length:count}, (_,index) => String(index)), 5, "")).rejects.toThrow();
    expect(mkdtemp).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    vi.doUnmock("node:fs/promises"); vi.doUnmock("@/lib/supabase/admin"); vi.doUnmock("@/lib/studio/slideshow"); vi.doUnmock("@/lib/studio/media");
    vi.resetModules();
  });

  it("rejects direct rendering without narration before filesystem or database I/O", async () => {
    const mkdtemp = vi.fn();
    const createAdminClient = vi.fn();
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({ mkdtemp, readFile: vi.fn(), rm: vi.fn(), stat: vi.fn(), writeFile: vi.fn() }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient }));
    vi.doMock("@/lib/studio/slideshow", () => ({ assembleSlideshow: vi.fn() }));
    vi.doMock("@/lib/studio/media", () => ({ storeStudioVideo: vi.fn(), signedStudioUrl: vi.fn() }));
    const server = await import("@/lib/studio/slideshow-server");
    const ids = Array.from({ length: 5 }, (_, index) => `11111111-1111-4111-8111-11111111111${index}`);
    await expect(server.renderSlideshow("owner", ids, 25, "sb-reverie", "task-id")).rejects.toThrow(/voix off est obligatoire/i);
    expect(mkdtemp).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    vi.doUnmock("node:fs/promises"); vi.doUnmock("@/lib/supabase/admin"); vi.doUnmock("@/lib/studio/slideshow"); vi.doUnmock("@/lib/studio/media");
    vi.resetModules();
  });

  it("rejects remixing a legacy silent slideshow before filesystem or image lookup", async () => {
    const mkdtemp = vi.fn();
    const imageIds = ["11111111-1111-4111-8111-111111111110", "11111111-1111-4111-8111-111111111111"];
    const row = { id: "22222222-2222-4222-8222-222222222222", user_id: "owner", kind: "video", status: "completed", storage_path: "owner/old.mp4", metadata: { type: "slideshow", imageGenerationIds: imageIds, duration: 25, musicId: "sb-reverie", voiceover: false } };
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }), in: () => query };
    const from = vi.fn(() => query);
    const createAdminClient = vi.fn(() => ({ from }));
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({ mkdtemp, readFile: vi.fn(), rm: vi.fn(), stat: vi.fn(), writeFile: vi.fn() }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient }));
    vi.doMock("@/lib/studio/slideshow", () => ({ assembleSlideshow: vi.fn() }));
    vi.doMock("@/lib/studio/media", () => ({ storeStudioVideo: vi.fn(), signedStudioUrl: vi.fn() }));
    const server = await import("@/lib/studio/slideshow-server");
    await expect(server.remixSlideshow("owner", row.id, "sb-reverie")).rejects.toThrow(/remix est bloqué.*voix off/i);
    expect(from).toHaveBeenCalledOnce();
    expect(mkdtemp).not.toHaveBeenCalled();
    vi.doUnmock("node:fs/promises"); vi.doUnmock("@/lib/supabase/admin"); vi.doUnmock("@/lib/studio/slideshow"); vi.doUnmock("@/lib/studio/media");
    vi.resetModules();
  });
});
