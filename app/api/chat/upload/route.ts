import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 15 * 1024 * 1024; // 15 Mo

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// Upload d'une image ou vidéo jointe à une conversation de l'assistant, pour
// que celui-ci puisse l'utiliser comme créative lors de la création de pubs.
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });

  const ext = IMAGE_TYPES[file.type] ?? VIDEO_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Seules les images (jpg, png, webp, gif) et vidéos (mp4, webm, mov) sont acceptées." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Le fichier dépasse 15 Mo." }, { status: 400 });

  const id = crypto.randomUUID();
  const path = `${user.id}/chat/${id}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error } = await admin.storage.from("studio-media").upload(path, body, { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: "Impossible de stocker le fichier." }, { status: 500 });

  const { data } = await admin.storage.from("studio-media").createSignedUrl(path, 24 * 3600);
  if (!data?.signedUrl) return NextResponse.json({ error: "Impossible de générer l'URL du fichier." }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl, type: file.type.startsWith("video") ? "video" : "image" });
}