import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { storeStudioVideoArtifact } from "@/lib/studio/video-artifacts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const generationId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.from.mockReset().mockReturnValue({ upload: mocks.upload });
  mocks.createAdminClient.mockReset().mockReturnValue({ storage: { from: mocks.from } });
});

describe("Studio video artifact uploads", () => {
  it("logs safe upload diagnostics while preserving the storage error", async () => {
    const privateBytes = Buffer.from("PRIVATE VIDEO CONTENT MUST NOT BE LOGGED");
    const storageError = Object.assign(new Error(`Unprocessable Entity for ${userId}/${generationId}`), { name: "StorageApiError", statusCode: "422" });
    mocks.upload.mockResolvedValueOnce({ error: storageError });
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(storeStudioVideoArtifact(userId, generationId, "segment-0.mp4", privateBytes, "video/mp4"))
      .rejects.toThrow("Impossible d’enregistrer une étape vidéo.");

    expect(mocks.from).toHaveBeenCalledWith("studio-media");
    expect(mocks.upload).toHaveBeenCalledWith(
      `${userId}/video-work/${generationId}/segment-0.mp4`,
      privateBytes,
      { contentType: "video/mp4", upsert: true },
    );
    expect(logger).toHaveBeenCalledWith("[studio-video] Supabase artifact upload failed", expect.objectContaining({
      stage: "supabase_storage_upload",
      filename: "segment-0.mp4",
      sizeBytes: privateBytes.byteLength,
      contentType: "video/mp4",
      errorName: "StorageApiError",
      status: "422",
      message: "Unprocessable Entity for [redacted]/[redacted]",
    }));
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(userId);
    expect(logged).not.toContain(generationId);
    expect(logged).not.toContain(privateBytes.toString());
    logger.mockRestore();
  });
});
