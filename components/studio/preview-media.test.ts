import { describe, expect, it } from "vitest";
import { resolveStudioPreviewMedia } from "./preview-media";

describe("Studio preview media by active session", () => {
  it("never exposes a stale image in the video session", () => {
    expect(resolveStudioPreviewMedia("video", "https://example.test/old-image.jpg", null)).toEqual({
      imageUrl: null,
      videoUrl: null,
    });
  });

  it("shows a completed video, not an old image, in the video session", () => {
    expect(resolveStudioPreviewMedia("video", "https://example.test/old-image.jpg", {
      status: "completed",
      contentUrl: "https://example.test/video.mp4",
    })).toEqual({ imageUrl: null, videoUrl: "https://example.test/video.mp4" });
  });

  it("shows a READY final video and waits for its URL before exposing it", () => {
    expect(resolveStudioPreviewMedia("video", null, {
      status: "READY",
      contentUrl: "https://example.test/ready.mp4",
    })).toEqual({ imageUrl: null, videoUrl: "https://example.test/ready.mp4" });
    expect(resolveStudioPreviewMedia("video", null, {
      status: "ready",
      contentUrl: null,
    })).toEqual({ imageUrl: null, videoUrl: null });
  });

  it("keeps an old video out of the image session", () => {
    expect(resolveStudioPreviewMedia("image", "https://example.test/image.jpg", {
      status: "completed",
      contentUrl: "https://example.test/old-video.mp4",
    })).toEqual({ imageUrl: "https://example.test/image.jpg", videoUrl: null });
  });
});
