import { beforeEach, describe, expect, it, vi } from "vitest";
const { falConfig, queueSubmit, queueStatus, queueResult } = vi.hoisted(() => ({
  falConfig: vi.fn(),
  queueSubmit: vi.fn(),
  queueStatus: vi.fn(),
  queueResult: vi.fn(),
}));
vi.mock("@fal-ai/client", () => ({
  fal: { config: falConfig, queue: { submit: queueSubmit, status: queueStatus, result: queueResult } },
}));
import { createFalVideo } from "@/lib/ai/fal";

describe("Fal UGC video adapter", () => {
  beforeEach(() => {
    vi.stubEnv("FAL_API_KEY", "test-key");
    queueSubmit.mockReset().mockResolvedValue({ request_id: "req-123" });
  });

  it("submits a single native-audio 20–30s reference video job", async () => {
    const jobId = await createFalVideo("UGC product scene", {
      duration: 25,
      resolution: "720p",
      aspectRatio: "9:16",
      referenceUrl: "https://shop.example/cover.webp",
      endUserId: "user-123",
    });
    expect(jobId).toBe("bytedance/seedance-2.5/reference-to-video::req-123");
    expect(queueSubmit).toHaveBeenCalledWith("bytedance/seedance-2.5/reference-to-video", {
      input: {
        prompt: "UGC product scene",
        duration: "25",
        resolution: "720p",
        aspect_ratio: "9:16",
        generate_audio: true,
        task: "reference",
        end_user_id: "user-123",
        image_urls: ["https://shop.example/cover.webp"],
      },
    });
  });

  it("rejects a duration outside the product's 20–30 second choices before submitting", async () => {
    await expect(createFalVideo("test", { duration: 15 as 20, resolution: "720p", aspectRatio: "16:9" }))
      .rejects.toThrow("Durée vidéo non supportée");
    expect(queueSubmit).not.toHaveBeenCalled();
  });
});
