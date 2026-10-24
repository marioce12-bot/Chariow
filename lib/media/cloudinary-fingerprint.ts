import { createHash } from "node:crypto";

const MAX_CAMPAIGN_MEDIA_BYTES = 100 * 1024 * 1024;

/** Calcule le SHA-256 du fichier source sans conserver tout un fichier vidéo en mémoire. */
export async function sha256FromCloudinaryUrl(url: string, cloudName: string): Promise<{ sha256: string; byteSize: number }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.startsWith(`/${cloudName}/`)) {
    throw new Error("L’URL média ne provient pas du Cloudinary configuré.");
  }
  const response = await fetch(parsed, { cache: "no-store", signal: AbortSignal.timeout(150_000) });
  if (!response.ok || !response.body) throw new Error("Le fichier Cloudinary est temporairement inaccessible.");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_CAMPAIGN_MEDIA_BYTES) throw new Error("Le fichier dépasse la limite de 100 Mo.");
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let byteSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      byteSize += value.byteLength;
      if (byteSize > MAX_CAMPAIGN_MEDIA_BYTES) {
        await reader.cancel();
        throw new Error("Le fichier dépasse la limite de 100 Mo.");
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!byteSize) throw new Error("Le fichier média est vide.");
  return { sha256: hash.digest("hex"), byteSize };
}
