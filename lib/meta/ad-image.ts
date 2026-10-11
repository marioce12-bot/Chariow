import { createAdminClient } from "@/lib/supabase/admin";
import { FEED_TRANSFORM, VERTICAL_TRANSFORM, feedTransformFor, readImageSize, withCloudinaryTransform } from "@/lib/media/creative-format";
import { META_GRAPH_BASE_URL } from "./api";

// Meta ne sait pas toujours télécharger une image depuis une URL signée de stockage privé
// (« Image non téléchargée … subcode 3 »). Ici, Vendeo récupère lui-même l'image et l'envoie
// à Meta (POST /act_<id>/adimages) : la créative utilise ensuite le `image_hash` renvoyé,
// sans que Meta ait à ouvrir de lien.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function detectMetaImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) return "image/png";
  return null;
}

// Chemin d'un fichier du bucket studio-media appartenant à l'utilisateur, déduit d'une URL signée de notre
// projet Supabase. Retourne null pour toute autre URL (autre hôte, autre utilisateur, tentative de « .. »).
export function ownStudioPathFromUrl(rawUrl: string, userId: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  let url: URL;
  let host: string;
  try {
    url = new URL(rawUrl);
    host = new URL(supabaseUrl).host;
  } catch {
    return null;
  }
  const marker = "/storage/v1/object/sign/studio-media/";
  if (url.protocol !== "https:" || url.host !== host || !url.pathname.startsWith(marker)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname.slice(marker.length));
  } catch {
    return null;
  }
  if (path.includes("..") || !path.startsWith(`${userId}/`)) return null;
  return path;
}

export function isOwnCloudinaryUrl(rawUrl: string, cloudName: string | undefined): boolean {
  if (!cloudName || !/^[A-Za-z0-9_-]+$/.test(cloudName)) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !url.username && !url.password && url.pathname.startsWith(`/${cloudName}/image/`);
  } catch {
    return false;
  }
}

export function extractAdImageHash(json: unknown): string | null {
  const images = (json as { images?: Record<string, { hash?: unknown }> } | null)?.images;
  if (!images || typeof images !== "object") return null;
  for (const image of Object.values(images)) {
    if (typeof image?.hash === "string" && image.hash) return image.hash;
  }
  return null;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
}

// Filet de sécurité pour les images Cloudinary : même si l'upload n'a pas normalisé le visuel
// (brouillon ancien, WebP, image trop étroite ou au mauvais ratio), on récupère une version
// JPEG/PNG au format accepté par Meta avant de l'envoyer. Deux passes maximum :
// 1. conversion en JPEG quand le format ou les dimensions sont illisibles (ex. WebP) ;
// 2. recadrage / agrandissement une fois les dimensions connues.
async function loadNormalizedCloudinaryBytes(imageUrl: string): Promise<Uint8Array | null> {
  let url = imageUrl;
  let bytes = await fetchBytes(url);
  for (let pass = 0; pass < 3 && bytes; pass++) {
    const type = detectMetaImageType(bytes);
    const transform = feedTransformFor(type ? readImageSize(bytes) : null, type !== null);
    if (!transform) return bytes;
    const next = withCloudinaryTransform(url, transform);
    if (!next || next === url) break;
    url = next;
    bytes = await fetchBytes(url);
  }
  return bytes && detectMetaImageType(bytes) ? bytes : null;
}

// Récupère les octets d'une image qui nous appartient : stockage Vendeo de l'utilisateur ou notre Cloudinary.
async function loadOwnImageBytes(userId: string, imageUrl: string): Promise<Uint8Array | null> {
  const studioPath = ownStudioPathFromUrl(imageUrl, userId, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (studioPath) {
    // Téléchargement direct avec la clé serveur : fonctionne même si l'URL signée a expiré.
    const { data, error } = await createAdminClient().storage.from("studio-media").download(studioPath);
    if (error || !data || data.size > MAX_IMAGE_BYTES) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  if (isOwnCloudinaryUrl(imageUrl, process.env.CLOUDINARY_CLOUD_NAME)) {
    return loadNormalizedCloudinaryBytes(imageUrl);
  }
  return null;
}

export async function uploadMetaAdImage(input: { accountId: string; accessToken: string; bytes: Uint8Array; filename?: string }): Promise<string> {
  const type = detectMetaImageType(input.bytes);
  if (!type) throw new Error("Format d'image non pris en charge (JPEG ou PNG attendu).");
  const form = new FormData();
  form.append("access_token", input.accessToken);
  form.append("filename", new Blob([input.bytes as unknown as BlobPart], { type }), input.filename ?? (type === "image/png" ? "creative.png" : "creative.jpg"));
  const response = await fetch(`${META_GRAPH_BASE_URL}/${input.accountId}/adimages`, { method: "POST", body: form, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  const hash = extractAdImageHash(json);
  if (!response.ok || !hash) {
    const message = (json as { error?: { message?: string; error_user_msg?: string } })?.error;
    throw new Error(message?.error_user_msg || message?.message || `Envoi de l'image à Meta refusé (${response.status})`);
  }
  return hash;
}

// Prépare l'image de la créative : envoie le fichier à Meta et retourne son hash.
// Si l'image n'est pas la nôtre ou si l'envoi échoue, retourne {} : l'appelant retombe sur l'URL (comportement d'avant).
export async function prepareMetaCreativeImage(input: { userId: string; accountId: string; accessToken: string; imageUrl: string }): Promise<{ imageHash?: string }> {
  try {
    const bytes = await loadOwnImageBytes(input.userId, input.imageUrl);
    if (!bytes || !detectMetaImageType(bytes)) return {};
    return { imageHash: await uploadMetaAdImage({ accountId: input.accountId, accessToken: input.accessToken, bytes }) };
  } catch (error) {
    console.error("prepareMetaCreativeImage: envoi de l'image à Meta impossible, repli sur l'URL", error instanceof Error ? error.message : error);
    return {};
  }
}

// Variantes par placement : 4:5 (fils d'actualité) et 9:16 (Stories / Reels), toutes deux dérivées de
// l'image d'origine par recadrage intelligent. Retourne null si l'image n'est pas sur notre Cloudinary
// ou si une variante est illisible ; lève une erreur si Meta refuse l'envoi (l'appelant gère le repli).
export async function prepareMetaPlacementImages(input: { accountId: string; accessToken: string; imageUrl: string }): Promise<{ feedHash: string; verticalHash: string } | null> {
  if (!isOwnCloudinaryUrl(input.imageUrl, process.env.CLOUDINARY_CLOUD_NAME)) return null;
  const feedUrl = withCloudinaryTransform(input.imageUrl, FEED_TRANSFORM);
  const verticalUrl = withCloudinaryTransform(input.imageUrl, VERTICAL_TRANSFORM);
  if (!feedUrl || !verticalUrl) return null;
  const [feedBytes, verticalBytes] = await Promise.all([fetchBytes(feedUrl), fetchBytes(verticalUrl)]);
  if (!feedBytes || !verticalBytes || !detectMetaImageType(feedBytes) || !detectMetaImageType(verticalBytes)) return null;
  const feedHash = await uploadMetaAdImage({ accountId: input.accountId, accessToken: input.accessToken, bytes: feedBytes, filename: "creative-feed.jpg" });
  const verticalHash = await uploadMetaAdImage({ accountId: input.accountId, accessToken: input.accessToken, bytes: verticalBytes, filename: "creative-vertical.jpg" });
  return { feedHash, verticalHash };
}
