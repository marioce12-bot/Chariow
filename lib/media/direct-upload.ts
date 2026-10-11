// Envoi direct navigateur → Cloudinary (signature fournie par /api/uploads/campaign-media/sign),
// puis validation/recadrage côté serveur via /api/uploads/campaign-media (JSON, sans le fichier).

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

export type CampaignMediaResult = { secure_url?: unknown; [key: string]: unknown };

function xhrUpload(url: string, form: FormData, onProgress?: (percent: number) => void): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let json: any = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json && typeof json.secure_url === "string") resolve(json);
      else reject(new Error(json?.error?.message || "Cloudinary n’a pas accepté le fichier"));
    };
    xhr.onerror = () => reject(new Error("Connexion perdue pendant l’envoi. Réessaie."));
    xhr.ontimeout = () => reject(new Error("L’envoi est trop long. Essaie avec une vidéo plus légère ou une meilleure connexion."));
    xhr.send(form);
  });
}

export async function uploadCampaignMedia(file: File, onProgress?: (percent: number) => void): Promise<CampaignMediaResult> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Format non supporté (JPG, PNG, WebP, MP4 ou MOV).");
  const isVideo = file.type.startsWith("video/");
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) throw new Error(`Fichier trop volumineux (maximum ${isVideo ? "100" : "10"} Mo)`);

  const signResponse = await fetch("/api/uploads/campaign-media/sign", { method: "POST" });
  const sign = await signResponse.json().catch(() => null);
  if (!signResponse.ok || !sign?.signature) throw new Error(sign?.error || "Impossible de préparer l’envoi du fichier");

  const resourceType = isVideo ? "video" : "image";
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", sign.timestamp);
  form.append("folder", sign.folder);
  form.append("signature", sign.signature);
  const uploaded = await xhrUpload(`https://api.cloudinary.com/v1_1/${sign.cloudName}/${resourceType}/upload`, form, onProgress);

  const response = await fetch("/api/uploads/campaign-media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resource_type: resourceType,
      secure_url: uploaded.secure_url,
      public_id: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
      original_filename: uploaded.original_filename ?? file.name,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Le fichier a été envoyé mais n’a pas pu être vérifié");
  return data ?? {};
}
