import { describe, expect, it } from "vitest";
import { getLicensedTrack } from "@/lib/studio/licensed-music";
import { DEFAULT_SLIDESHOW_MUSIC_ID, resolveSlideshowMusicId } from "@/lib/studio/slideshow-music";

describe("automatic slideshow music", () => {
  it("resolves an empty choice to a real licensed instrumental", () => {
    expect(resolveSlideshowMusicId("")).toBe(DEFAULT_SLIDESHOW_MUSIC_ID);
    expect(getLicensedTrack(resolveSlideshowMusicId(""))?.id).toBe("sb-amberlight");
  });

  it("keeps an explicit licensed ID and trims surrounding whitespace", () => {
    expect(resolveSlideshowMusicId(" sb-wonderful ")).toBe("sb-wonderful");
  });
});
