import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
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
  const folder = "vendeo/campaign-creatives";
  const { createHash } = await import("node:crypto");
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const upload = new FormData();
  upload.append("file", file);
  upload.append("api_key", apiKey);
  upload.append("timestamp", timestamp);
  upload.append("folder", folder);
  upload.append("signature", signature);
  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const result = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, { method: "POST", body: upload });
  const json = await result.json().catch(() => ({}));
  if (!result.ok || typeof json.secure_url !== "string") {
    console.error("Cloudinary campaign upload failed", { status: result.status, error: json?.error?.message });
    return NextResponse.json({ error: "Cloudinary n’a pas accepté le fichier" }, { status: 502 });
  }
  return NextResponse.json({ secure_url: json.secure_url, public_id: json.public_id, resource_type: resourceType, original_filename: json.original_filename ?? file.name });
}
