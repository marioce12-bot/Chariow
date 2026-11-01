import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ upload: storage.upload }) } }),
}));
import { storeStudioImage, storeStudioVideoFromUrl } from "@/lib/studio/media";

const userId = "11111111-1111-4111-8111-111111111111";
const generationId = "22222222-2222-4222-8222-222222222222";
const priorImportFlag = process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT;

beforeEach(() => {
  delete process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT;
  storage.upload.mockResolvedValue({ error: null });
});
afterEach(() => {
  if (priorImportFlag === undefined) delete process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT;
  else process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT = priorImportFlag;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("private Supabase image storage fallback", () => {
  it("accepts an image from fal.media and uploads the exact bounded bytes to a user-scoped private object path", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/png", "content-length": String(bytes.length) },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(storeStudioImage("https://v3.fal.media/files/test/image.png", userId, generationId)).resolves.toBe(`${userId}/${generationId}.png`);
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://v3.fal.media/files/test/image.png"), expect.objectContaining({
      cache: "no-store", redirect: "error",
    }));
    const [path, body, options] = storage.upload.mock.calls[0] as [string, ArrayBuffer, { contentType: string; upsert: boolean }];
    expect(path).toBe(`${userId}/${generationId}.png`);
    expect([...new Uint8Array(body)]).toEqual([...bytes]);
    expect(body.byteLength).toBe(bytes.length);
    expect(options).toEqual({ contentType: "image/png", upsert: true });
  });

  it("rejects local, metadata, deceptive-host, non-HTTPS and redirectable sources before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const unsafe = [
      "http://v3.fal.media/files/image.png",
      "https://127.0.0.1/latest/meta-data/",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost/image.png",
      "https://fal.media.attacker.example/image.png",
      "https://v3.fal.media@attacker.example/image.png",
      "file:///etc/passwd",
      "data:text/html;base64,PGgxPk5vPC9oMT4=",
    ];
    for (const source of unsafe)
      await expect(storeStudioImage(source, userId, generationId)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("accepts only canonical bounded image data URIs and stores no unrelated Buffer memory", async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7]);
    const dataUrl = `data:image/png;base64,${data.toString("base64")}`;
    await storeStudioImage(dataUrl, userId, generationId);
    const [, body] = storage.upload.mock.calls[0] as [string, ArrayBuffer];
    expect(body.byteLength).toBe(data.length);
    expect([...new Uint8Array(body)]).toEqual([...data]);

    await expect(storeStudioImage("data:image/png,not-base64", userId, generationId)).rejects.toThrow("Format image data invalide");
    await expect(storeStudioImage("data:image/jpeg;base64,AA==", userId, generationId)).rejects.toThrow("Format image data invalide");
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("rejects remote non-image content and oversized bodies", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("<html>bad</html>", { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<html>bad</html>", { status: 200 }))
      .mockResolvedValueOnce(new Response("<html>bad</html>", { status: 200, headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/png", "content-length": String(33 * 1024 * 1024) } })));
    await expect(storeStudioImage("https://v3.fal.media/files/test/page", userId, generationId)).rejects.toThrow("unexpected content type");
    await expect(storeStudioImage("https://v3.fal.media/files/test/no-type", userId, generationId)).rejects.toThrow("unexpected content type");
    await expect(storeStudioImage("https://v3.fal.media/files/test/fake.png", userId, generationId)).rejects.toThrow("does not match");
    await expect(storeStudioImage("https://v3.fal.media/files/test/large.png", userId, generationId)).rejects.toThrow("size limit");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("keeps remote video import explicitly disabled by default", async () => {
    await expect(storeStudioVideoFromUrl("https://v3.fal.media/files/test/video.mp4", userId, generationId))
      .rejects.toThrow("Remote video storage is disabled");
  });
});
