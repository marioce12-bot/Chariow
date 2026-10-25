import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { LOW_QUALITY_WIDTH, META_MIN_WIDTH, MIN_SOURCE_WIDTH, feedAdjustment, feedTransformFor, withCloudinaryTransform } from "@/lib/media/creative-format";
import { sha256FromCloudinaryUrl } from "@/lib/media/cloudinary-fingerprint";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);
const FOLDER = "vendeo/campaign-creatives";

async function isDeliverable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function buildResponse(json: any, resourceType: "image" | "video", fallbackName: string) {
  const original: string = json.secure_url;
  const width = Number(json.width) || 0;
  const height = Number(json.height) || 0;
  const base = { public_id: json.public_id, resource_type: resourceType, original_filename: json.original_filename ?? fallbackName, width, height };

  if (resourceType === "video") {
    if (width > 0 && width < META_MIN_WIDTH) {
      return NextResponse.json({ error: `Vidéo trop petite (${width} px de large) : Meta exige au moins ${META_MIN_WIDTH} px. Choisis une vidéo plus grande.` }, { status: 422 });
    }
    return NextResponse.json({ secure_url: original, original_url: original, ...base, adjustment: null, low_quality: false });
  }

  if (width > 0 && width < MIN_SOURCE_WIDTH) {
    return NextResponse.json({ error: `Image trop petite (${width} px de large). Choisis une image d'au moins ${MIN_SOURCE_WIDTH} px de large, idéalement 1080 px.` }, { status: 422 });
  }

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

function safeHash(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{16}$/i.test(value) ? value.toLowerCase() : null;
}

async function persistMediaAsset(input: {
  supabase: any;
  userId: string;
  sourceUrl: string;
  deliveryUrl: string;
  cloudName: string;
  kind: "image" | "video";
  perceptualHash: string | null;
  keyframeHashes: string[];
  hintedFileSize?: number;
  exactBytes?: Uint8Array;
}) {
  const fingerprint = input.exactBytes
    ? { sha256: createHash("sha256").update(input.exactBytes).digest("hex"), byteSize: input.exactBytes.byteLength }
    : await sha256FromCloudinaryUrl(input.sourceUrl, input.cloudName);
  const { data: existingAsset, error: existingAssetError } = await input.supabase.from("creative_media_assets")
    .select("id,perceptual_hash,keyframe_hashes").eq("user_id", input.userId).eq("sha256", fingerprint.sha256).maybeSingle();
  if (existingAssetError) throw existingAssetError;
  const perceptualHash = input.perceptualHash ?? existingAsset?.perceptual_hash ?? null;
  const keyframeHashes = input.keyframeHashes.length ? input.keyframeHashes : existingAsset?.keyframe_hashes ?? [];
  const { data: asset, error: assetError } = await input.supabase
    .from("creative_media_assets")
    .upsert({
      user_id: input.userId,
      kind: input.kind,
      sha256: fingerprint.sha256,
      perceptual_hash: perceptualHash,
      keyframe_hashes: keyframeHashes,
      source_url: input.sourceUrl,
      delivery_url: input.deliveryUrl,
      file_size: fingerprint.byteSize || input.hintedFileSize || null,
    }, { onConflict: "user_id,sha256" })
    .select("id")
    .single();
  if (assetError || !asset?.id) throw assetError ?? new Error("La fiche du média n’a pas été créée.");
  const urls = [...new Set([input.sourceUrl, input.deliveryUrl])];
  const { error: aliasError } = await input.supabase.from("creative_media_asset_urls").upsert(
    urls.map((url) => ({ user_id: input.userId, asset_id: asset.id, url })),
    { onConflict: "user_id,url", ignoreDuplicates: true },
  );
  if (aliasError) throw aliasError;
  return { assetId: String(asset.id), sha256: fingerprint.sha256, byteSize: fingerprint.byteSize };
}

async function responseWithFingerprint(
  uploadResponse: NextResponse,
  input: Parameters<typeof persistMediaAsset>[0],
) {
  if (!uploadResponse.ok) return uploadResponse;
  const result = await uploadResponse.json();
  try {
    const saved = await persistMediaAsset({
      ...input,
      deliveryUrl: typeof result.secure_url === "string" ? result.secure_url : input.deliveryUrl,
    });
    return NextResponse.json({ ...result, media_asset_id: saved.assetId, fingerprinted: true });
  } catch (error) {
    // Les déploiements antérieurs à la migration gardent leurs uploads opérationnels.
    console.warn("Creative media fingerprint not persisted", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({
      ...result,
      media_asset_id: null,
      fingerprinted: false,
      fingerprint_warning: "L’empreinte média n’est pas encore disponible. Appliquez la migration versionnée puis renvoyez ce média pour l’ajouter à la bibliothèque.",
    });
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

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
    const perceptualHash = safeHash(body.perceptual_hash);
    const keyframeHashes = Array.isArray(body.keyframe_hashes)
      ? body.keyframe_hashes.map(safeHash).filter((value: string | null): value is string => Boolean(value)).slice(0, 5)
      : [];
    return responseWithFingerprint(
      await buildResponse({ secure_url: secureUrl, public_id: publicId, width: body.width, height: body.height, format: body.format, original_filename: body.original_filename }, resourceType, ""),
      {
        supabase, userId: user.id, sourceUrl: secureUrl, deliveryUrl: secureUrl, cloudName,
        kind: resourceType, perceptualHash, keyframeHashes,
        hintedFileSize: Number.isSafeInteger(body.file_size) && body.file_size > 0 ? body.file_size : undefined,
      },
    );
  }

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
  const uploadResponse = await buildResponse(json, resourceType, file.name);
  return responseWithFingerprint(uploadResponse, {
    supabase, userId: user.id, sourceUrl: json.secure_url,
    deliveryUrl: json.secure_url, cloudName, kind: resourceType,
    perceptualHash: null, keyframeHashes: [], exactBytes: new Uint8Array(await file.arrayBuffer()),
    hintedFileSize: file.size,
  });
}
