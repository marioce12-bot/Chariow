import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isPreviewEnabled, publicTracks, resolveTrackPath } from "@/lib/studio/slideshow-server";

describe("slideshow backend safety", () => {
  const prior = process.env.VERCEL_ENV;
  afterEach(() => { if (prior === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prior; });

  it("enables the feature only on Vercel preview deployments", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewEnabled()).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(isPreviewEnabled()).toBe(false);
    delete process.env.VERCEL_ENV;
    expect(isPreviewEnabled()).toBe(false);
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
});
