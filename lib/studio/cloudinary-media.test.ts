import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCloudinaryStudioPathOwner,
  deleteCloudinaryStudioAsset,
  importFalMediaToCloudinary,
  signedCloudinaryPrivateUrl,
} from "./cloudinary-media";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "33333333-3333-4333-8333-333333333333";
const generationId = "22222222-2222-4222-8222-222222222222";
const folder = `vendeo/studio/${userId}`;
const publicId = `${folder}/${generationId}`;
const sourceUrl = "https://v3.fal.media/files/test/generated-image.png";
const originalEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

function signature(params: Record<string, string>, secret = "secret-test-only") {
  const canonical = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join("&");
  return createHash("sha1").update(`${canonical}${secret}`).digest("hex");
}

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
  it("imports a fal.ai URL remotely as authenticated media and returns a signed private download", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ public_id: publicId, format: "png", resource_type: "image" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const path = await importFalMediaToCloudinary(sourceUrl, userId, generationId, "image");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://api.cloudinary.com/v1_1/cloud-test/image/upload");
    const form = init.body as FormData;
    expect(form.get("file")).toBe(sourceUrl); // The media bytes never pass through this server.
    expect(form.get("type")).toBe("authenticated");
    expect(form.get("api_key")).toBe("key-test");
    expect(form.get("api_secret")).toBeNull();
    const uploadParams = {
      folder: String(form.get("folder")),
      overwrite: String(form.get("overwrite")),
      public_id: String(form.get("public_id")),
      timestamp: String(form.get("timestamp")),
      type: String(form.get("type")),
    };
    expect(uploadParams).toEqual({ folder, overwrite: "true", public_id: generationId, timestamp: expect.any(String), type: "authenticated" });
    expect(form.get("signature")).toBe(signature(uploadParams));
    expect(path).toMatch(/^cloudinary-private:/);
    assertCloudinaryStudioPathOwner(path, userId);
    expect(() => assertCloudinaryStudioPathOwner(path, otherUserId)).toThrow("does not belong");

    const url = new URL(signedCloudinaryPrivateUrl(path, userId));
    expect(url.hostname).toBe("api.cloudinary.com");
    expect(url.pathname).toBe("/v1_1/cloud-test/image/download");
    expect(url.searchParams.get("type")).toBe("authenticated");
    expect(url.searchParams.get("public_id")).toBe(publicId);
    expect(url.searchParams.get("api_key")).toBe("key-test");
    expect(url.searchParams.get("api_secret")).toBeNull();
    expect(url.hostname).not.toBe("res.cloudinary.com");
    expect(Number(url.searchParams.get("expires_at"))).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500);
    const signedParams = Object.fromEntries([...url.searchParams].filter(([key]) => key !== "signature" && key !== "api_key"));
    expect(url.searchParams.get("signature")).toBe(signature(signedParams));
    expect(() => signedCloudinaryPrivateUrl(path, otherUserId)).toThrow("does not belong");
    const tamperedPath = `${path.slice(0, -1)}${path.endsWith("A") ? "B" : "A"}`;
    expect(() => signedCloudinaryPrivateUrl(tamperedPath, userId)).toThrow("invalid");
  });

  it("imports video bytes by provider URL into the private video endpoint", async () => {
    const videoUrl = "https://v3.fal.media/files/test/generated-video.mp4";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ public_id: publicId, format: "mp4", resource_type: "video" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const path = await importFalMediaToCloudinary(videoUrl, userId, generationId, "video");
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://api.cloudinary.com/v1_1/cloud-test/video/upload");
    expect((init.body as FormData).get("file")).toBe(videoUrl);
    expect((init.body as FormData).get("type")).toBe("authenticated");
    const url = new URL(signedCloudinaryPrivateUrl(path, userId));
    expect(url.pathname).toBe("/v1_1/cloud-test/video/download");
    expect(url.searchParams.get("type")).toBe("authenticated");
    expect(url.searchParams.get("public_id")).toBe(publicId);
  });

  it("stores video segments under distinct private IDs and permits their cleanup", async () => {
    const segmentPublicId = `${folder}/${generationId}-segment-0`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ public_id: segmentPublicId, format: "mp4", resource_type: "video" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const path = await importFalMediaToCloudinary("https://v3.fal.media/files/segment.mp4", userId, generationId, "video", 0);
    expect(new URL(signedCloudinaryPrivateUrl(path, userId)).searchParams.get("public_id")).toBe(segmentPublicId);
    await expect(deleteCloudinaryStudioAsset(path, userId)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.cloudinary.com/v1_1/cloud-test/video/destroy");
    await expect(deleteCloudinaryStudioAsset(path, otherUserId)).rejects.toThrow("does not belong");
  });

  it("rejects unsafe, deceptive, credentialed, and nonstandard-port sources before contacting Cloudinary", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sources = [
      "http://v3.fal.media/image.png",
      "https://fal.media.attacker.example/image.png",
      "https://v3.fal.media.attacker.example/image.png",
      "https://v3.fal.media@attacker.example/image.png",
      "https://user:pass@v3.fal.media/image.png",
      "https://v3.fal.media:8443/image.png",
      "file:///etc/passwd",
      "data:image/png;base64,AA==",
    ];
    for (const source of sources)
      await expect(importFalMediaToCloudinary(source, userId, generationId, "image")).rejects.toThrow("not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before contacting Cloudinary", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(importFalMediaToCloudinary(sourceUrl, "../other", generationId, "image")).rejects.toThrow("identifiers");
    await expect(importFalMediaToCloudinary(sourceUrl, userId, "not-a-uuid", "image")).rejects.toThrow("identifiers");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not persist a Cloudinary response with a mismatched type, foreign ID, or unsafe format", async () => {
    const invalid = [
      { public_id: publicId, format: "png", resource_type: "video" },
      { public_id: `other/${generationId}`, format: "png", resource_type: "image" },
      { public_id: publicId, format: "png<script>", resource_type: "image" },
    ];
    for (const result of invalid) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(importFalMediaToCloudinary(sourceUrl, userId, generationId, "image")).rejects.toThrow("remote import failed");
    }
  });

  it("rejects non-success responses and malformed provider JSON", async () => {
    for (const response of [new Response("unavailable", { status: 503 }), new Response("not-json", { status: 200 })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(importFalMediaToCloudinary(sourceUrl, userId, generationId, "image")).rejects.toThrow("remote import failed");
    }
  });
});
