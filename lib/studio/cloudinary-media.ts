import { createHash } from "node:crypto";

const STORAGE_PREFIX = "cloudinary-private:";
const FAL_MEDIA_HOST = /(^|\.)fal\.media$/i;

type ResourceType = "image" | "video";
type AssetDescriptor = { resourceType: ResourceType; publicId: string; format: string };

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary Studio storage is not configured");
  return { cloudName, apiKey, apiSecret };
}

function apiSignature(params: Record<string, string>, apiSecret: string) {
  const canonical = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

function encodeDescriptor(asset: AssetDescriptor) {
  return `${STORAGE_PREFIX}${Buffer.from(JSON.stringify(asset)).toString("base64url")}`;
}

function decodeDescriptor(path: string): AssetDescriptor | null {
  if (!path.startsWith(STORAGE_PREFIX)) return null;
  try {
    const value = JSON.parse(Buffer.from(path.slice(STORAGE_PREFIX.length), "base64url").toString("utf8"));
    if ((value.resourceType !== "image" && value.resourceType !== "video") ||
        typeof value.publicId !== "string" || !value.publicId ||
        typeof value.format !== "string" || !/^[a-z0-9]{2,8}$/i.test(value.format)) return null;
    return value as AssetDescriptor;
  } catch {
    return null;
  }
}

export async function importFalMediaToCloudinary(
  sourceUrl: string,
  userId: string,
  generationId: string,
  resourceType: ResourceType,
) {
  let source: URL;
  try { source = new URL(sourceUrl); }
  catch { throw new Error("fal.ai media URL is invalid"); }
  if (source.protocol !== "https:" || !FAL_MEDIA_HOST.test(source.hostname))
    throw new Error("fal.ai media host is not allowed for remote import");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(generationId))
    throw new Error("Studio media identifiers are invalid");

  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = `vendeo/studio/${userId}`;
  const publicId = generationId;
  const signedParams = { folder, overwrite: "true", public_id: publicId, timestamp, type: "authenticated" };
  const form = new FormData();
  form.append("file", source.toString());
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
  if (!response.ok || typeof result?.public_id !== "string" || typeof result?.format !== "string")
    throw new Error(`Cloudinary remote import failed (${response.status})`);
  return encodeDescriptor({ resourceType, publicId: result.public_id, format: result.format });
}

export function signedCloudinaryPrivateUrl(path: string) {
  const asset = decodeDescriptor(path);
  if (!asset) throw new Error("Cloudinary Studio storage path is invalid");
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
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

export function isCloudinaryStudioPath(path: string) {
  return path.startsWith(STORAGE_PREFIX);
}
