// Préparation des pièces jointes du chat Vendeo AI.
//
// Vercel refuse tout corps de requête > ~4,5 Mo (erreur 413 non-JSON) : une photo de téléphone
// pèse souvent 5 à 12 Mo, ce qui donnait « Impossible d'envoyer ce fichier. ». On redimensionne
// donc les images dans le navigateur avant de les envoyer à /api/chat/upload.

export const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024; // marge sous la limite de 4,5 Mo de Vercel
const MAX_SIDE = 2048;
const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality));
}

// Renvoie le fichier tel quel s'il est déjà accepté et assez léger ; sinon une version JPEG
// redimensionnée (2048 px max) sous la limite. En cas d'échec de conversion, renvoie l'original.
export async function prepareChatImage(file: File): Promise<File> {
  const isPassthrough = PASSTHROUGH_TYPES.includes(file.type);
  if (isPassthrough && file.size <= SERVER_UPLOAD_LIMIT) return file;
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // Fond blanc : le JPEG n'a pas de transparence.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob && blob.size <= SERVER_UPLOAD_LIMIT) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
      }
    }
  } catch {
    // Format illisible par le navigateur : on laisse le serveur répondre avec son message.
  }
  return file;
}
