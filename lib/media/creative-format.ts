// Règles de format des visuels publicitaires (Meta) et construction des transformations Cloudinary.
//
// Contexte : à l'étape 5 du wizard, Meta renvoie des erreurs d'aperçu du type
// « Contenu multimédia pas assez large » (largeur < 500 px) ou « Élément image unique non valide »
// (Statut WhatsApp : ratios 9:16, 1,91:1, 16:9, 1:1 ou 4:5 et largeur ≥ 500 px).
// Plutôt que de laisser l'utilisateur les découvrir, on normalise le visuel dès l'upload.

export const META_MIN_WIDTH = 500;
export const TARGET_WIDTH = 1080;
export const MAX_WIDTH = 2048;
/** En dessous, on refuse : agrandir une image aussi petite donnerait un résultat inutilisable. */
export const MIN_SOURCE_WIDTH = 300;
/** En dessous, on accepte mais on prévient que la qualité sera réduite. */
export const LOW_QUALITY_WIDTH = 600;

// Ratios (largeur / hauteur) acceptés sur l'ensemble des placements Meta, Statut WhatsApp compris.
const ACCEPTED_RATIOS = [9 / 16, 4 / 5, 1, 1.91, 16 / 9];
const RATIO_TOLERANCE = 0.02;

export type ImageSize = { width: number; height: number };
export type FeedAdjustment = "cropped" | "resized" | "converted";

export function isAcceptedRatio({ width, height }: ImageSize): boolean {
  if (!(width > 0 && height > 0)) return false;
  const ratio = width / height;
  return ACCEPTED_RATIOS.some((accepted) => Math.abs(ratio - accepted) / accepted <= RATIO_TOLERANCE);
}

const FLATTEN = "b_white,f_jpg,q_auto";

/** Version « fil d'actualité » : toujours 4:5, 1080 × 1350, recadrage intelligent centré sur le sujet. */
export const FEED_TRANSFORM = `ar_4:5,c_fill,g_auto,w_${TARGET_WIDTH},${FLATTEN}`;
/** Version « Stories / Reels » : toujours 9:16, 1080 × 1920. */
export const VERTICAL_TRANSFORM = `ar_9:16,c_fill,g_auto,w_${TARGET_WIDTH},${FLATTEN}`;

/**
 * Transformation Cloudinary à appliquer pour que le visuel soit accepté partout, ou null si rien à faire.
 * - ratio non accepté → recadrage intelligent 4:5 (1080 de large) ;
 * - ratio accepté mais trop étroit → agrandissement à 1080 ; trop large → réduction à 2048 ;
 * - format autre que JPEG/PNG (ex. WebP) → conversion en JPEG ;
 * - dimensions inconnues → conversion en JPEG d'abord (l'appelant relit ensuite les dimensions).
 */
export function feedTransformFor(size: ImageSize | null, isJpegOrPng: boolean): string | null {
  if (!size) return FLATTEN;
  const parts: string[] = [];
  if (!isAcceptedRatio(size)) parts.push("ar_4:5", "c_fill", "g_auto", `w_${TARGET_WIDTH}`);
  else if (size.width < TARGET_WIDTH) parts.push("c_scale", `w_${TARGET_WIDTH}`);
  else if (size.width > MAX_WIDTH) parts.push("c_scale", `w_${MAX_WIDTH}`);
  if (parts.length === 0 && isJpegOrPng) return null;
  return [...parts, FLATTEN].join(",");
}

export function feedAdjustment(size: ImageSize | null, isJpegOrPng: boolean): FeedAdjustment | null {
  if (!feedTransformFor(size, isJpegOrPng)) return null;
  if (!size) return "converted";
  if (!isAcceptedRatio(size)) return "cropped";
  if (size.width < TARGET_WIDTH || size.width > MAX_WIDTH) return "resized";
  return "converted";
}

const CLOUDINARY_MARKER = "/image/upload/";
const TRANSFORM_SEGMENT = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/;

/**
 * Remplace (ou insère) le segment de transformation d'une URL Cloudinary d'image.
 * La transformation s'applique toujours à l'image d'origine : on peut donc dériver
 * plusieurs variantes (4:5, 9:16…) d'une même URL sans perdre de contenu.
 */
export function withCloudinaryTransform(url: string, transform: string): string | null {
  const index = url.indexOf(CLOUDINARY_MARKER);
  if (index === -1) return null;
  const head = url.slice(0, index + CLOUDINARY_MARKER.length);
  const rest = url.slice(index + CLOUDINARY_MARKER.length);
  const [first, ...others] = rest.split("/");
  const tail = TRANSFORM_SEGMENT.test(first) ? others.join("/") : rest;
  if (!tail) return null;
  return `${head}${transform}/${tail}`;
}

/** Lit les dimensions d'un JPEG ou d'un PNG depuis ses octets (null si format inconnu ou tronqué). */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      if (length < 2) return null;
      i += 2 + length;
    }
  }
  return null;
}
