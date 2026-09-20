import { createAdminClient } from "@/lib/supabase/admin";

export async function storeStudioImage(imageUrl: string, userId: string, generationId: string, outputFormat = "png") {
  const admin = createAdminClient();
  const extension = outputFormat === "jpeg" ? "jpg" : "png";
  const path = `${userId}/${generationId}.${extension}`;
  let body: ArrayBuffer;
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma < 0) throw new Error("Format image data invalide");
    const encoded = imageUrl.slice(comma + 1);
    body = Buffer.from(encoded, imageUrl.slice(0, comma).includes(";base64") ? "base64" : "utf8").buffer;
  } else {
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Téléchargement image impossible (${response.status})`);
    body = await response.arrayBuffer();
  }
  const { error } = await admin.storage.from("studio-media").upload(path, body, { contentType: extension === "jpg" ? "image/jpeg" : "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export async function signedStudioUrl(path: string) {
  const { data, error } = await createAdminClient().storage.from("studio-media").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
