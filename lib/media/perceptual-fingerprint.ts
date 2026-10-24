export type MediaPerceptualFingerprint = {
  perceptualHash: string | null;
  keyframeHashes: string[];
};

const HASH_SIZE = 32;
const LOW_FREQUENCY_SIZE = 8;

/** Calcule un pHash DCT à 64 bits à partir d’une image en niveaux de gris 32×32. */
export function perceptualHashFromGrayscale(gray: ArrayLike<number>): string {
  if (gray.length !== HASH_SIZE * HASH_SIZE) {
    throw new Error("L’image doit contenir exactement 32 × 32 pixels.");
  }
  const coefficients: number[] = [];
  for (let v = 0; v < LOW_FREQUENCY_SIZE; v += 1) {
    for (let u = 0; u < LOW_FREQUENCY_SIZE; u += 1) {
      let total = 0;
      for (let y = 0; y < HASH_SIZE; y += 1) {
        const cosY = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * HASH_SIZE));
        for (let x = 0; x < HASH_SIZE; x += 1) {
          total += Number(gray[y * HASH_SIZE + x]) *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * HASH_SIZE)) * cosY;
        }
      }
      coefficients.push(total);
    }
  }
  const medianValues = coefficients.slice(1).sort((a, b) => a - b);
  const median = medianValues[Math.floor(medianValues.length / 2)];
  const bits = coefficients.map((value, index) => index > 0 && value > median ? "1" : "0");
  let hash = "";
  for (let index = 0; index < bits.length; index += 4) {
    hash += parseInt(bits.slice(index, index + 4).join(""), 2).toString(16);
  }
  return hash;
}

function grayPixelsFromContext(context: CanvasRenderingContext2D): number[] {
  const { data } = context.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
  const gray: number[] = new Array(HASH_SIZE * HASH_SIZE);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
  return gray;
}

function canvasForMedia(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = HASH_SIZE;
  canvas.height = HASH_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Le navigateur ne permet pas de lire l’image.");
  return { canvas, context };
}

export async function computeMediaPerceptualFingerprint(file: File): Promise<MediaPerceptualFingerprint> {
  if (file.type.startsWith("image/")) {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      const { canvas, context } = canvasForMedia();
      context.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
      return { perceptualHash: perceptualHashFromGrayscale(grayPixelsFromContext(context)), keyframeHashes: [] };
    } catch {
      return { perceptualHash: null, keyframeHashes: [] };
    } finally {
      bitmap?.close();
    }
  }

  if (!file.type.startsWith("video/")) return { perceptualHash: null, keyframeHashes: [] };
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await waitForVideo(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return { perceptualHash: null, keyframeHashes: [] };
    }
    const { canvas, context } = canvasForMedia();
    const hashes: string[] = [];
    for (const fraction of [0.12, 0.5, 0.88]) {
      const safeTime = Math.min(Math.max(video.duration * fraction, 0.01), Math.max(0, video.duration - 0.05));
      video.currentTime = safeTime;
      await waitForVideo(video, "seeked");
      if (!video.videoWidth || !video.videoHeight) continue;
      context.drawImage(video, 0, 0, HASH_SIZE, HASH_SIZE);
      hashes.push(perceptualHashFromGrayscale(grayPixelsFromContext(context)));
    }
    return { perceptualHash: null, keyframeHashes: hashes };
  } catch {
    // La détection exacte par SHA-256 continue de fonctionner si le navigateur ne décode pas une image-clé.
    return { perceptualHash: null, keyframeHashes: [] };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function waitForVideo(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Délai de lecture vidéo dépassé.")), 12_000);
    const onLoaded = () => finish();
    const onError = () => finish(new Error("La vidéo ne peut pas être lue dans ce navigateur."));
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onLoaded);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    video.addEventListener(eventName, onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}
