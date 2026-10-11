import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { LOW_QUALITY_WIDTH, META_MIN_WIDTH, MIN_SOURCE_WIDTH, feedAdjustment, feedTransformFor, withCloudinaryTransform } from "@/lib/media/creative-format";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);
const FOLDER = "vendeo/campaign-creatives";

// Vérifie que Cloudinary sait bien livrer la version transformée (et la met en cache CDN).
// Si le compte Cloudinary bloque les transformations à la volée (« Strict transformations »),
// on retombe sur l'image d'origine plutôt que de casser l'envoi.
async function isDeliverable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

// Validation + normalisation d'un fichier déjà hébergé sur Cloudinary (commun aux deux flux d'envoi).
async function buildResponse(json: any, resourceType: "image" | "video", fallbackName: string) {
  const original: string = json.secure_url;
  const width = Number(json.width) || 0;
  const height = Number(json.height) || 0;
  const base = { public_id: json.public_id, resource_type: resourceType, original_filename: json.original_filename ?? fallbackName, width, height };

  // Vidéo : pas de recadrage automatique pour l'instant, mais on refuse tout de suite ce que Meta refusera à l'étape 5.
  if (resourceType === "video") {
    if (width > 0 && width < META_MIN_WIDTH) {
      return NextResponse.json({ error: `Vidéo trop petite (${width} px de large) : Meta exige au moins ${META_MIN_WIDTH} px. Choisis une vidéo plus grande.` }, { status: 422 });
    }
    return NextResponse.json({ secure_url: original, ...base, adjustment: null, low_quality: false });
  }

  if (width > 0 && width < MIN_SOURCE_WIDTH) {
    return NextResponse.json({ error: `Image trop petite (${width} px de large). Choisis une image d'au moins ${MIN_SOURCE_WIDTH} px de large, idéalement 1080 px.` }, { status: 422 });
  }

  // Image : on normalise en arrière-plan (recadrage intelligent, agrandissement, conversion JPEG)
  // pour que Meta accepte le visuel sur tous les placements dès l'étape 5.
  const size = width > 0 && height > 0 ? { width, height } : null;
  const format = typeof json.format === "string" ? json.format.toLowerCase() : "";
  const isJpegOrPng = ["jpg", "jpeg", "png"].includes(format);
  const transform = feedTransformFor(size, isJpegOrPng);
  let finalUrl = original;
  let adjustment = null;
  if (transform) {
    const candidate = withCloudinaryTransform(original, transform);
    if (candidate && (await isDeliverable(candidate))) {
      finalUrl = candidate;
      adjustment = feedAdjustment(size, isJpegOrPng);
    } else {
      console.error("Cloudinary: transformation du visuel indisponible, image d'origine conservée", { transform });
    }
  }

  return NextResponse.json({ secure_url: finalUrl, original_url: original, ...base, adjustment, low_quality: width > 0 && width < LOW_QUALITY_WIDTH });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  // Flux principal : le navigateur a envoyé le fichier directement à Cloudinary (voir /sign et
  // lib/media/direct-upload.ts) et nous transmet seulement le résultat en JSON. Cela évite la
  // limite de 4,5 Mo des fonctions Vercel, qui bloquait les vidéos.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => null);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return NextResponse.json({ error: "Cloudinary n’est pas configuré sur le serveur" }, { status: 500 });
    const resourceType: "image" | "video" = body?.resource_type === "video" ? "video" : "image";
    const secureUrl = typeof body?.secure_url === "string" ? body.secure_url : "";
    const publicId = typeof body?.public_id === "string" ? body.public_id : "";
    if (!secureUrl.startsWith(`https://res.cloudinary.com/${cloudName}/${resourceType}/upload/`) || !publicId.startsWith(`${FOLDER}/`)) {
      return NextResponse.json({ error: "Réponse d’envoi invalide" }, { status: 400 });
    }
    return buildResponse(
      { secure_url: secureUrl, public_id: publicId, width: body.width, height: body.height, format: body.format, original_filename: body.original_filename },
      resourceType,
      "",
    );
  }

  // Ancien flux (fichier envoyé à cette route) : conservé pour compatibilité, limité à ~4,5 Mo sur Vercel.
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Format non supporté" }, { status: 400 });
  const max = file.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) return NextResponse.json({ error: `Fichier trop volumineux (maximum ${file.type.startsWith("video/") ? "100" : "10"} Mo)` }, { status: 400 });
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return NextResponse.json({ error: "Cloudinary n’est pas configuré sur le serveur" }, { status: 500 });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const { createHash } = await import("node:crypto");
  const signature = createHash("sha1").update(`folder=${FOLDER}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const upload = new FormData();
  upload.append("file", file);
  upload.append("api_key", apiKey);
  upload.append("timestamp", timestamp);
  upload.append("folder", FOLDER);
  upload.append("signature", signature);
  const resourceType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  const result = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, { method: "POST", body: upload });
  const json = await result.json().catch(() => ({}));
  if (!result.ok || typeof json.secure_url !== "string") {
    console.error("Cloudinary campaign upload failed", { status: result.status, error: json?.error?.message });
    return NextResponse.json({ error: "Cloudinary n’a pas accepté le fichier" }, { status: 502 });
  }
  return buildResponse(json, resourceType, file.name);
}
