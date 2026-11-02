import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertCloudinaryStudioPathOwner,
  importFalMediaToCloudinary,
  isAllowedFalMediaUrl,
  isCloudinaryStudioPath,
  signedCloudinaryPrivateUrl,
} from "@/lib/studio/cloudinary-media";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIDEO_GENERATION_ID = new RegExp(`^${UUID.source.slice(1, -1)}(?:-${UUID.source.slice(1, -1)})?$`, "i");
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 45 * 60 * 1000;
const SIGNED_URL_CACHE_MAX = 500;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlInFlight = new Map<string, Promise<string>>();

function assertStudioIds(userId: string, generationId: string) {
  if (!UUID.test(userId) || !VIDEO_GENERATION_ID.test(generationId))
    throw new Error("Studio media identifiers are invalid");
}

function exactArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function readBoundedImage(response: Response) {
  const announced = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > MAX_IMAGE_BYTES)
    throw new Error("Image source exceeds size limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Image source has no body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Image source exceeds size limit");
    }
    chunks.push(value);
  }
  if (!length) throw new Error("Image source is empty");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length);
}

function assertImageSignature(bytes: Buffer, contentType: string) {
  const signature = contentType === "image/png"
    ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : Buffer.from([0xff, 0xd8, 0xff]);
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature))
    throw new Error("Image source content does not match the expected image format");
}

export async function storeStudioImage(imageUrl: string, userId: string, generationId: string, outputFormat = "png") {
  assertStudioIds(userId, generationId);
  if (outputFormat !== "png" && outputFormat !== "jpeg")
    throw new Error("Studio image format is invalid");
  if (process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT === "true")
    return importFalMediaToCloudinary(imageUrl, userId, generationId, "image");

  const admin = createAdminClient();
  const extension = outputFormat === "jpeg" ? "jpg" : "png";
  const contentType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
  const path = `${userId}/${generationId}.${extension}`;
  let bytes: Buffer;
  if (imageUrl.startsWith("data:")) {
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(imageUrl);
    if (!match || match[1].toLowerCase() !== contentType || match[2].length % 4 !== 0)
      throw new Error("Format image data invalide");
    bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2])
      throw new Error("Format image data invalide");
    assertImageSignature(bytes, contentType);
  } else {
    if (!isAllowedFalMediaUrl(imageUrl))
      throw new Error("Image source is not an allowed fal.ai media URL");
    const response = await fetch(new URL(imageUrl), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Téléchargement image impossible (${response.status})`);
    const returnedType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (returnedType !== contentType)
      throw new Error("Image source returned an unexpected content type");
    bytes = await readBoundedImage(response);
    assertImageSignature(bytes, contentType);
  }
  const { error } = await admin.storage.from("studio-media").upload(path, exactArrayBuffer(bytes), { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function storeStudioVideo(video: { body: ArrayBuffer; contentType?: string }, userId: string, generationId: string) {
  assertStudioIds(userId, generationId);
  const admin = createAdminClient();
  const path = `${userId}/${generationId}.mp4`;
  const { error } = await admin.storage.from("studio-media").upload(path, video.body, { contentType: video.contentType || "video/mp4", upsert: true });
  if (error) throw error;
  return path;
}

export async function storeStudioVideoFromUrl(videoUrl: string, userId: string, generationId: string) {
  if (process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT !== "true")
    throw new Error("Remote video storage is disabled until private Cloudinary import is enabled");
  return importFalMediaToCloudinary(videoUrl, userId, generationId, "video");
}

function assertOwnedPath(path: string, ownerUserId: string) {
  if (!UUID.test(ownerUserId)) throw new Error("Studio media owner is invalid");
  if (isCloudinaryStudioPath(path)) {
    assertCloudinaryStudioPathOwner(path, ownerUserId);
    return;
  }
  if (!path.startsWith(`${ownerUserId}/`) || path.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\")))
    throw new Error("Studio media path does not belong to this user");
}

export async function signedStudioUrl(path: string, ownerUserId: string) {
  assertOwnedPath(path, ownerUserId);
  const cacheKey = `${ownerUserId}:${path}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    signedUrlCache.delete(cacheKey);
    signedUrlCache.set(cacheKey, cached);
    return cached.url;
  }
  if (cached) signedUrlCache.delete(cacheKey);
  const pending = signedUrlInFlight.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
    if (isCloudinaryStudioPath(path)) {
      const url = signedCloudinaryPrivateUrl(path, ownerUserId);
      const entry = { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
      signedUrlCache.set(cacheKey, entry);
      while (signedUrlCache.size > SIGNED_URL_CACHE_MAX) signedUrlCache.delete(signedUrlCache.keys().next().value!);
      return url;
    }
    const { data, error } = await createAdminClient().storage.from("studio-media").createSignedUrl(path, 3600);
    if (error) throw error;
    const entry = { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
    signedUrlCache.set(cacheKey, entry);
    while (signedUrlCache.size > SIGNED_URL_CACHE_MAX) signedUrlCache.delete(signedUrlCache.keys().next().value!);
    return entry.url;
  })();
  signedUrlInFlight.set(cacheKey, request);
  try { return await request; }
  finally { if (signedUrlInFlight.get(cacheKey) === request) signedUrlInFlight.delete(cacheKey); }
}
