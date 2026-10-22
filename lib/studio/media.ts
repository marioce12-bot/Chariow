import { createAdminClient } from "@/lib/supabase/admin";

export async function storeStudioImage(imageUrl: string, userId: string, generationId: string, outputFormat = "png") {
  const admin = createAdminClient();
  const extension = outputFormat === "jpeg" ? "jpg" : "png";
  const path = `${userId}/${generationId}.${extension}`;
  let body: ArrayBuffer;
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma < 0) throw new Error("Format image data invalide");
    const encoded = imageUrl.slice(comma + 1);
    body = Buffer.from(encoded, imageUrl.slice(0, comma).includes(";base64") ? "base64" : "utf8").buffer;
  } else {
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Téléchargement image impossible (${response.status})`);
    body = await response.arrayBuffer();
  }
  const { error } = await admin.storage.from("studio-media").upload(path, body, { contentType: extension === "jpg" ? "image/jpeg" : "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export async function storeStudioVideo(video: { body: ArrayBuffer; contentType?: string }, userId: string, generationId: string) {
  const admin = createAdminClient();
  const path = `${userId}/${generationId}.mp4`;
  const { error } = await admin.storage.from("studio-media").upload(path, video.body, { contentType: video.contentType || "video/mp4", upsert: true });
  if (error) throw error;
  return path;
}

const SIGNED_URL_TTL_MS = 45 * 60 * 1000;
const SIGNED_URL_CACHE_MAX = 500;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlInFlight = new Map<string, Promise<string>>();

export async function signedStudioUrl(path: string) {
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now) {
    // Refresh LRU position while keeping the original expiration.
    signedUrlCache.delete(path);
    signedUrlCache.set(path, cached);
    return cached.url;
  }
  if (cached) signedUrlCache.delete(path);
  const pending = signedUrlInFlight.get(path);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await createAdminClient().storage.from("studio-media").createSignedUrl(path, 3600);
    if (error) throw error;
    const entry = { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
    signedUrlCache.set(path, entry);
    while (signedUrlCache.size > SIGNED_URL_CACHE_MAX) signedUrlCache.delete(signedUrlCache.keys().next().value!);
    return entry.url;
  })();
  signedUrlInFlight.set(path, request);
  try { return await request; }
  finally { if (signedUrlInFlight.get(path) === request) signedUrlInFlight.delete(path); }
}
