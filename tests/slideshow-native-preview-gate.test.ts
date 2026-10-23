import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { isNativeSlideshowMotionEnabled } from "../lib/studio/slideshow-server";

const previous = process.env.VERCEL_ENV;
afterEach(() => {
  if (previous === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previous;
});

describe("native slideshow Preview isolation", () => {
  it.each(["preview", "production", "development", undefined])("gates %s explicitly", environment => {
    if (environment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = environment;
    expect(isNativeSlideshowMotionEnabled()).toBe(environment === "preview");
  });
  it("keeps the durable task seed, local assembly and unchanged narration pipeline", async () => {
    const source = await readFile("lib/studio/slideshow-server.ts", "utf8");
    expect(source).toContain("motionDesign: isNativeSlideshowMotionEnabled()");
    expect(source).toContain("profileSeed: taskId");
    expect(source).toContain("synthesizeCoveredSlideshowVoice");
    expect(source).not.toMatch(/generateVideo|generateFal|@fal-ai/);
    expect(source).toContain('engine: "vendeo-native-v1"');
    expect(source).toContain('characters: "static"');
  });
});
