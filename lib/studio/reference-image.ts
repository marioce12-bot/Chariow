const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_HOST = /(^|\.)(chariow\.com|chariowcdn\.com)$/i;
const ALLOWED_UPLOAD_HOST = /(^|\.)cloudinary\.com$/i;

function allowedUrl(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
    && (ALLOWED_HOST.test(url.hostname) || ALLOWED_UPLOAD_HOST.test(url.hostname));
}

export async function fetchReferenceImage(imageUrl: string): Promise<{ buffer: Buffer; type: string } | null> {
  try {
    let url = new URL(imageUrl);
    const signal = AbortSignal.timeout(10_000);
    for (let hop = 0; hop <= 3; hop++) {
      if (!allowedUrl(url)) { console.warn("[studio] image de référence refusée (hôte non autorisé):", url.hostname); return null; }
      const response = await fetch(url, {
        cache: "no-store", signal, redirect: "manual",
        headers: { Accept: "image/webp,image/png,image/jpeg" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !allowedUrl(new URL(response.url || url.toString()))) return null;
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(type)) { console.warn("[studio] image de référence refusée (type):", type); return null; }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;
      return { buffer, type };
    }
    return null;
  } catch { return null; }
}
