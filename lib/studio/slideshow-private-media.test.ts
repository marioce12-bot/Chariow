import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({ from: vi.fn(), storageFrom: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }),
}));

import { importFalMediaToCloudinary } from "./cloudinary-media";
import { loadOwnedImages } from "./slideshow-server";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "33333333-3333-4333-8333-333333333333";
const generationId = "22222222-2222-4222-8222-222222222222";
const originalEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function setImageRow(storagePath: string, owner = userId) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(async () => ({
      data: [{ id: generationId, user_id: owner, kind: "image", status: "completed", storage_path: storagePath }],
      error: null,
    })),
  };
  mocks.from.mockReturnValue(query);
}

async function cloudinaryPath(owner = userId) {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
    public_id: `vendeo/studio/${owner}/${generationId}`,
    format: "png",
    resource_type: "image",
  }), { status: 200 }));
  return importFalMediaToCloudinary(
    "https://v3.fal.media/files/test/generated.png",
    owner,
    generationId,
    "image",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDINARY_CLOUD_NAME = "cloud-test";
  process.env.CLOUDINARY_API_KEY = "key-test";
  process.env.CLOUDINARY_API_SECRET = "secret-test-only";
  mocks.fetch.mockResolvedValue(new Response("unused", { status: 503 }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  if (originalEnv.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = originalEnv.cloudName;
  if (originalEnv.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = originalEnv.apiKey;
  if (originalEnv.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = originalEnv.apiSecret;
  vi.unstubAllGlobals();
});

describe("private slideshow image sources", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "slideshow-private-media-test-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("reads authenticated Cloudinary images through the exact private API origin", async () => {
    const descriptor = await cloudinaryPath();
    setImageRow(descriptor);
    mocks.fetch.mockResolvedValueOnce(new Response(png, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(png.length) },
    }));

    const result = await loadOwnedImages(userId, [generationId], directory);
    expect(result.thumbnailStoragePath).toBe(descriptor);
    expect(await readFile(result.files[0])).toEqual(png);
    expect(path.extname(result.files[0])).toBe(".png");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const [input, init] = mocks.fetch.mock.calls[1] as [URL, RequestInit];
    expect(input.origin).toBe("https://api.cloudinary.com");
    expect(input.pathname).toBe("/v1_1/cloud-test/image/download");
    expect(input.searchParams.get("type")).toBe("authenticated");
    expect(input.searchParams.get("public_id")).toBe(`vendeo/studio/${userId}/${generationId}`);
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it("continues to read legacy owner-scoped Supabase image paths", async () => {
    const legacyPath = `${userId}/${generationId}.png`;
    setImageRow(legacyPath);
    mocks.storageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: new Blob([png], { type: "image/png" }), error: null }),
    });

    const result = await loadOwnedImages(userId, [generationId], directory);
    expect(result.thumbnailStoragePath).toBe(legacyPath);
    expect(await readFile(result.files[0])).toEqual(png);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.storageFrom).toHaveBeenCalledWith("studio-media");
  });

  it("rejects forged and foreign-owner Cloudinary descriptors before private download", async () => {
    const foreign = await cloudinaryPath(otherUserId);
    setImageRow(foreign);
    await expect(loadOwnedImages(userId, [generationId], directory)).rejects.toThrow(/does not belong/);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const forged = `${foreign.slice(0, -1)}${foreign.endsWith("A") ? "B" : "A"}`;
    setImageRow(forged);
    await expect(loadOwnedImages(userId, [generationId], directory)).rejects.toThrow(/invalid or does not belong/);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it("rejects a mismatched response content type or image signature", async () => {
    const descriptor = await cloudinaryPath();
    setImageRow(descriptor);
    mocks.fetch.mockResolvedValueOnce(new Response(png, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await expect(loadOwnedImages(userId, [generationId], directory)).rejects.toThrow(/unexpected content type/);

    mocks.fetch.mockResolvedValueOnce(new Response(Buffer.from("not a png"), {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    await expect(loadOwnedImages(userId, [generationId], directory)).rejects.toThrow(/do not match/);
  });
});
