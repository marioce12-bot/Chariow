import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importFalMediaToCloudinary, signedCloudinaryPrivateUrl } from "./cloudinary-media";

const userId = "11111111-1111-4111-8111-111111111111";
const generationId = "22222222-2222-4222-8222-222222222222";
const sourceUrl = "https://v3.fal.media/files/test/generated-image.png";
const originalEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = "cloud-test";
  process.env.CLOUDINARY_API_KEY = "key-test";
  process.env.CLOUDINARY_API_SECRET = "secret-test-only";
});
afterEach(() => {
  if (originalEnv.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = originalEnv.cloudName;
  if (originalEnv.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = originalEnv.apiKey;
  if (originalEnv.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = originalEnv.apiSecret;
  vi.unstubAllGlobals();
});

describe("Cloudinary private Studio media", () => {
  it("imports a fal.ai URL remotely as authenticated media and signs a short-lived download", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ public_id: "vendeo/studio/user/image-id", format: "png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const path = await importFalMediaToCloudinary(sourceUrl, userId, generationId, "image");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.body as FormData).get("file")).toBe(sourceUrl);
    expect((init.body as FormData).get("type")).toBe("authenticated");
    expect(path).toMatch(/^cloudinary-private:/);
    const url = new URL(signedCloudinaryPrivateUrl(path));
    expect(url.hostname).toBe("api.cloudinary.com");
    expect(url.searchParams.get("type")).toBe("authenticated");
    expect(url.searchParams.get("public_id")).toBe("vendeo/studio/user/image-id");
    expect(Number(url.searchParams.get("expires_at"))).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500);
  });

  it("rejects non-fal hosts before calling Cloudinary", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(importFalMediaToCloudinary("https://attacker.example/media.png", userId, generationId, "image")).rejects.toThrow("not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
