const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_HOST = /(^|\.)chariow\.com$/i;

export async function fetchReferenceImage(imageUrl: string): Promise<{ buffer: Buffer; type: string } | null> {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) { console.warn("[studio] image de référence refusée (hôte non autorisé):", url.hostname); return null; }
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const finalUrl = new URL(response.url || url.toString());
    if (finalUrl.protocol !== "https:" || !ALLOWED_HOST.test(finalUrl.hostname)) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) { console.warn("[studio] image de référence refusée (type):", type); return null; }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;
    return { buffer, type };
  } catch { return null; }
}
