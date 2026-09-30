import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedLogoUrl } from "./config";

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

// Vérifie le type réel du fichier (octets magiques), pas seulement le type déclaré par le navigateur. SVG exclu.
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...Array.from(bytes.slice(start, end)));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type LogoResult = { ok: true; url: string } | { ok: false; status: number; error: string };

export async function uploadLogo(bytes: Uint8Array): Promise<LogoResult> {
  if (bytes.length === 0) return { ok: false, status: 400, error: "Fichier vide" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, status: 413, error: `Logo trop volumineux (maximum ${MAX_LOGO_BYTES / (1024 * 1024)} Mo)` };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, status: 400, error: "Format non supporté : utilise une image JPEG, PNG ou WebP" };
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return { ok: false, status: 500, error: "Cloudinary n’est pas configuré sur le serveur" };
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "vendeo/storefronts";
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart], { type }), "logo");
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || typeof json.secure_url !== "string" || !isAllowedLogoUrl(json.secure_url, cloudName)) {
    console.error("Cloudinary storefront logo upload failed", { status: response.status, error: json?.error?.message });
    return { ok: false, status: 502, error: "Le logo n’a pas pu être enregistré" };
  }
  return { ok: true, url: json.secure_url };
}

// Reprend une image jointe dans le chat (URL signée du bucket studio-media) pour en faire le logo.
// On ne télécharge jamais une URL arbitraire : le chemin doit appartenir à l'utilisateur et à notre bucket.
export async function importChatAttachmentAsLogo(userId: string, signedUrl: string): Promise<LogoResult> {
  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    return { ok: false, status: 400, error: "Pièce jointe invalide" };
  }
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
  const marker = "/storage/v1/object/sign/studio-media/";
  if (!supabaseHost || url.host !== supabaseHost || !url.pathname.startsWith(marker)) return { ok: false, status: 400, error: "Pièce jointe invalide" };
  const path = decodeURIComponent(url.pathname.slice(marker.length));
  if (!path.startsWith(`${userId}/chat/`) || path.includes("..")) return { ok: false, status: 403, error: "Pièce jointe non autorisée" };
  const { data, error } = await createAdminClient().storage.from("studio-media").download(path);
  if (error || !data) return { ok: false, status: 404, error: "Pièce jointe introuvable" };
  return uploadLogo(new Uint8Array(await data.arrayBuffer()));
}
