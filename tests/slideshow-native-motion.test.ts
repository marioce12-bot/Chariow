import { describe, expect, it } from "vitest";
import { buildNativeMotionScenes, chooseSlideshowMotionProfile } from "@/lib/studio/slideshow-motion";

describe("native slideshow motion design", () => {
  it("creates five restrained camera beats and holds the final CTA steady", () => {
    const scenes = buildNativeMotionScenes(5, 30, 0.8);
    expect(scenes).toHaveLength(5);
    expect(scenes.slice(0, 4).every(scene => scene.zoom === "1+0.012*min(on/150,1)")).toBe(true);
    expect(new Set(scenes.slice(0, 4).map(scene => `${scene.x}/${scene.y}`)).size).toBeGreaterThan(1);
    expect(scenes[4]).toMatchObject({ zoom: "1", x: "(iw-iw/zoom)*0.5", y: "(ih-ih/zoom)*0.5" });
    expect(scenes.every(scene => ["fade", "smoothleft", "smoothright"].includes(scene.transition))).toBe(true);
  });

  it("is deterministic and rejects invalid configuration", () => {
    expect(buildNativeMotionScenes(5, 30, 0.8)).toEqual(buildNativeMotionScenes(5, 30, 0.8));
    expect(chooseSlideshowMotionProfile("seed")).toEqual(chooseSlideshowMotionProfile("seed"));
    expect(() => buildNativeMotionScenes(0, 30, 0.8)).toThrow();
  });
});
