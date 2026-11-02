import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const STORAGE_PREFIX = "cloudinary-private:";
const FAL_MEDIA_HOST = /(^|\.)fal\.media$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_FORMATS = new Set(["png", "jpg", "jpeg", "webp"]);

type ResourceType = "image" | "video";
type AssetDescriptor = {
  resourceType: ResourceType;
  userId: string;
  generationId: string;
  publicId: string;
  format: string;
};

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !/^[a-zA-Z0-9_-]{1,64}$/.test(cloudName) || !apiKey || !apiSecret)
    throw new Error("Cloudinary Studio storage is not configured");
  return { cloudName, apiKey, apiSecret };
}

function apiSignature(params: Record<string, string>, apiSecret: string) {
  const canonical = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

function encodeDescriptor(asset: AssetDescriptor, apiSecret: string) {
  const payload = Buffer.from(JSON.stringify(asset)).toString("base64url");
  const mac = createHmac("sha256", apiSecret).update(payload).digest("base64url");
  return `${STORAGE_PREFIX}${payload}.${mac}`;
}

function decodeDescriptor(path: string, apiSecret: string): AssetDescriptor | null {
  if (!path.startsWith(STORAGE_PREFIX)) return null;
  const encoded = path.slice(STORAGE_PREFIX.length);
  const separator = encoded.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = encoded.slice(0, separator);
  const suppliedMac = encoded.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(suppliedMac)) return null;
  const expectedMac = createHmac("sha256", apiSecret).update(payload).digest();
  const actualMac = Buffer.from(suppliedMac, "base64url");
  if (actualMac.length !== expectedMac.length || !timingSafeEqual(actualMac, expectedMac)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if ((value.resourceType !== "image" && value.resourceType !== "video") ||
        typeof value.userId !== "string" || !UUID.test(value.userId) ||
        typeof value.generationId !== "string" || !UUID.test(value.generationId) ||
        typeof value.publicId !== "string" ||
        (value.publicId !== value.generationId && value.publicId !== `vendeo/studio/${value.userId}/${value.generationId}`) ||
        typeof value.format !== "string" || !/^[a-z0-9]{2,8}$/i.test(value.format)) return null;
    return value as AssetDescriptor;
  } catch {
    return null;
  }
}

export function isAllowedFalMediaUrl(rawUrl: string) {
  try {
    const source = new URL(rawUrl);
    return source.protocol === "https:" &&
      !source.username && !source.password &&
      (!source.port || source.port === "443") &&
      FAL_MEDIA_HOST.test(source.hostname);
  } catch {
    return false;
  }
}

export async function importFalMediaToCloudinary(
  sourceUrl: string,
  userId: string,
  generationId: string,
  resourceType: ResourceType,
) {
  if (!isAllowedFalMediaUrl(sourceUrl))
    throw new Error("fal.ai media host is not allowed for remote import");
  if (!UUID.test(userId) || !UUID.test(generationId))
    throw new Error("Studio media identifiers are invalid");

  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = `vendeo/studio/${userId}`;
  const publicId = generationId;
  const signedParams = { folder, overwrite: "true", public_id: publicId, timestamp, type: "authenticated" };
  const form = new FormData();
  form.append("file", new URL(sourceUrl).toString());
  form.append("api_key", apiKey);
  form.append("folder", folder);
  form.append("overwrite", "true");
  form.append("public_id", publicId);
  form.append("timestamp", timestamp);
  form.append("type", "authenticated");
  form.append("signature", apiSignature(signedParams, apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(resourceType === "video" ? 120_000 : 30_000),
  });
  const result = await response.json().catch(() => null) as { public_id?: unknown; format?: unknown; resource_type?: unknown } | null;
  const expectedFullId = `${folder}/${publicId}`;
  const validPublicId = result?.public_id === expectedFullId || result?.public_id === publicId;
  if (!response.ok || !validPublicId || result?.resource_type !== resourceType ||
      typeof result?.format !== "string" || !/^[a-z0-9]{2,8}$/i.test(result.format))
    throw new Error(`Cloudinary remote import failed (${response.status})`);
  return encodeDescriptor({ resourceType, userId, generationId, publicId: result.public_id as string, format: result.format }, apiSecret);
}

export function assertCloudinaryStudioPathOwner(path: string, expectedUserId: string) {
  const { apiSecret } = cloudinaryConfig();
  const asset = decodeDescriptor(path, apiSecret);
  if (!asset || asset.userId !== expectedUserId)
    throw new Error("Cloudinary Studio storage path does not belong to this user");
}

export function signedCloudinaryPrivateUrl(path: string, expectedUserId?: string) {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const asset = decodeDescriptor(path, apiSecret);
  if (!asset || (expectedUserId && asset.userId !== expectedUserId))
    throw new Error("Cloudinary Studio storage path is invalid or does not belong to this user");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const expiresAt = (Number(timestamp) + 3600).toString();
  const signedParams = {
    expires_at: expiresAt,
    format: asset.format,
    public_id: asset.publicId,
    timestamp,
    type: "authenticated",
  };
  const url = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${asset.resourceType}/download`);
  for (const [key, value] of Object.entries(signedParams)) url.searchParams.set(key, value);
  url.searchParams.set("signature", apiSignature(signedParams, apiSecret));
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

export function signedCloudinaryPrivateImageDownload(path: string, expectedUserId: string) {
  const { cloudName, apiSecret } = cloudinaryConfig();
  const asset = decodeDescriptor(path, apiSecret);
  const format = asset?.format.toLowerCase();
  if (!asset || asset.resourceType !== "image" || asset.userId !== expectedUserId || !format || !IMAGE_FORMATS.has(format))
    throw new Error("Cloudinary Studio image is invalid or does not belong to this user");

  const url = new URL(signedCloudinaryPrivateUrl(path, expectedUserId));
  const expectedPath = `/v1_1/${encodeURIComponent(cloudName)}/image/download`;
  if (url.origin !== "https://api.cloudinary.com" || url.pathname !== expectedPath || url.username || url.password || url.hash ||
      url.searchParams.get("type") !== "authenticated" || url.searchParams.get("format")?.toLowerCase() !== format ||
      url.searchParams.get("public_id") !== asset.publicId || !url.searchParams.get("signature") ||
      !url.searchParams.get("api_key") || !url.searchParams.get("expires_at"))
    throw new Error("Cloudinary Studio image download URL is invalid");

  const contentType = format === "jpg" || format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const extension = format === "jpeg" ? "jpg" : format;
  return { url: url.toString(), format, contentType, extension };
}

export function isCloudinaryStudioPath(path: string) {
  return path.startsWith(STORAGE_PREFIX);
}
