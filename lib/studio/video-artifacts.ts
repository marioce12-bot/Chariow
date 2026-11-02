import { createAdminClient } from "@/lib/supabase/admin";

function artifactPath(userId: string, generationId: string, filename: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-f0-9-]{36}$/i.test(generationId)) {
    throw new Error("Identifiant vidéo invalide.");
  }
  if (!/^(segment-[01]\.mp4|continuity-frame\.png)$/.test(filename)) {
    throw new Error("Nom de fichier temporaire vidéo invalide.");
  }
  return `${userId}/video-work/${generationId}/${filename}`;
}

export async function storeStudioVideoArtifact(
  userId: string,
  generationId: string,
  filename: string,
  body: ArrayBuffer | Buffer,
  contentType: string,
) {
  const path = artifactPath(userId, generationId, filename);
  const { error } = await createAdminClient()
    .storage.from("studio-media")
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    const details = error as { name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown };
    const rawMessage = typeof details.message === "string" ? details.message.slice(0, 200) : "Storage upload rejected";
    console.error("[studio-video] Supabase artifact upload failed", {
      stage: "supabase_storage_upload",
      filename,
      sizeBytes: body.byteLength,
      contentType,
      errorName: typeof details.name === "string" ? details.name.slice(0, 80) : "StorageError",
      status: details.statusCode ?? details.status,
      code: typeof details.code === "string" ? details.code.slice(0, 80) : undefined,
      message: rawMessage.split(userId).join("[redacted]").split(generationId).join("[redacted]"),
    });
    const wrapped = new Error("Impossible d’enregistrer une étape vidéo.");
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
  return path;
}

export async function readStudioVideoArtifact(path: string) {
  const { data, error } = await createAdminClient().storage.from("studio-media").download(path);
  if (error || !data) throw new Error("Une étape vidéo enregistrée est indisponible.");
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteStudioVideoArtifacts(paths: string[]) {
  if (!paths.length) return;
  const { error } = await createAdminClient().storage.from("studio-media").remove(paths);
  if (error) throw new Error("Impossible de nettoyer les fichiers temporaires vidéo.");
}
