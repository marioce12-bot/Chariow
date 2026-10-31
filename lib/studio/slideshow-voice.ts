import { Buffer } from "node:buffer";
import { buildSlideshowCta, buildSlideshowPlan, campaignGoal, InsufficientProductDetailsError, slideshowEvidence, slideshowSourceCandidates } from "@/lib/studio/slideshow-plan";
import { LICENSED_MUSIC } from "@/lib/studio/licensed-music";
import { neutralProductCta, resolveProductLanguage } from "@/lib/studio/product-language";

export const SLIDESHOW_VOICE_MODEL = "gemini-3.8-flash-tts" as const;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 90_000;
const MUSIC_SOURCE = "https://www.scottbuckley.com.au/library/";
// Entries are sourced from each official track page, not audio analysis. Instrumental piano/ambient textures are preferred to keep speech intelligible.
export const SLIDESHOW_MUSIC_METADATA: Record<string, { tags: string[]; sourceUrl: string }> = {
  "sb-wonderful": { tags: ["happy", "pop", "piano", "organ", "vibes", "bass", "drums"], sourceUrl: MUSIC_SOURCE + "wonderful/" },
  "sb-life-is": { tags: ["reflective", "ambient", "piano", "strings", "synth", "instrumental"], sourceUrl: MUSIC_SOURCE + "life-is/" },
  "sb-amberlight": { tags: ["warm", "nostalgic", "piano", "orchestral", "instrumental"], sourceUrl: MUSIC_SOURCE + "amberlight/" },
  "sb-reverie": { tags: ["dreamlike", "intimate", "piano", "synth", "strings", "instrumental"], sourceUrl: MUSIC_SOURCE + "reverie/" },
  "sb-ephemera": { tags: ["ambient", "cello", "electronics", "instrumental"], sourceUrl: MUSIC_SOURCE + "ephemera/" },
  "sb-home-was-you": { tags: ["peaceful", "folksy", "nostalgic", "piano", "strings", "accordion", "percussion"], sourceUrl: MUSIC_SOURCE + "home-was-you/" },
  "sb-a-kind-of-hope": { tags: ["bittersweet", "hopeful", "piano", "strings", "atmospheric-synth"], sourceUrl: "https://www.scottbuckley.com.au/library/a-kind-of-hope/" },
  "sb-resolutions": { tags: ["uplifting", "hopeful", "piano", "strings"], sourceUrl: "https://www.scottbuckley.com.au/library/resolutions/" },
  "sb-horizons": { tags: ["melancholy", "optimistic", "piano", "strings", "arpeggiated-synth"], sourceUrl: "https://www.scottbuckley.com.au/library/horizons/" },
  "sb-ascension": { tags: ["sad", "melancholy", "hopeful", "orchestra", "distorted-synth"], sourceUrl: "https://www.scottbuckley.com.au/library/ascension/" },
  "sb-this-too-shall-pass": { tags: [], sourceUrl: "https://www.scottbuckley.com.au/library/this-too-shall-pass/" },
  "sb-signal-to-noise": { tags: ["mysterious", "cinematic", "dark", "melancholy", "hopeful", "cello", "piano", "warm-synth", "low-strings"], sourceUrl: "https://www.scottbuckley.com.au/library/signal-to-noise/" },
  "sb-filaments": { tags: ["warm", "emotional", "piano", "strings", "synth"], sourceUrl: "https://www.scottbuckley.com.au/library/filaments/" },
};

export function slideshowVoiceAvailability() {
  const environment = process.env.VERCEL_ENV;
  const supported = environment === "preview" || environment === "production";
  const enabled = process.env.VENDEO_SLIDESHOW_TTS_ENABLED === "true" ||
    (environment === "preview" && process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED === "true");
  // A Preview is the normal owner-review flow; test-only environment flags must not disable Create there.
  const allowed = environment === "preview" || (supported && enabled && process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED === "true");
  return { available: allowed, voiceoverEnabled: supported, voiceoverTestAllowed: allowed,
    environment: environment ?? "development", model: SLIDESHOW_VOICE_MODEL,
    reason: allowed ? undefined : "Voix off momentanément indisponible. Aucun appel vocal ni crédit supplémentaire consommé." };
}
export class SlideshowVoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlideshowVoiceUnavailableError";
  }
}
export function assertSlideshowVoiceAllowed(): void {
  const environment = process.env.VERCEL_ENV;
  if (environment === "preview") return;
  if (environment !== "production") throw new SlideshowVoiceUnavailableError("TTS diaporama réservé aux environnements preview ou production autorisés.");
  const enabled = process.env.VENDEO_SLIDESHOW_TTS_ENABLED === "true";
  if (!enabled) throw new SlideshowVoiceUnavailableError("La voix off n’est pas encore activée dans cet environnement. Aucun appel vocal effectué.");
  if (process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED !== "true") throw new SlideshowVoiceUnavailableError("Voix off bloquée : le palier gratuit Gemini doit être confirmé. Aucune offre payante utilisée.");
}

export type SlideshowVoicePlan = { script: string; language: string; musicId: string; model: typeof SLIDESHOW_VOICE_MODEL; voice: string; duration: number; tone: string };
export type GeminiVoiceDisposition = "retryable" | "uncertain";
export class GeminiVoiceError extends Error {
  constructor(readonly disposition: GeminiVoiceDisposition, readonly status: number | null, cause?: unknown) {
    super(disposition === "retryable" ? `Gemini voice request refused (HTTP ${status}).` : "Gemini voice request outcome is uncertain.", { cause });
    this.name = "GeminiVoiceError";
  }
}
export function classifyGeminiVoiceStatus(status: number): GeminiVoiceDisposition {
  return status >= 400 && status < 500 && status !== 408 ? "retryable" : "uncertain";
}
function category(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (/livre|book|roman|journal|album/.test(text)) return "books";
  if (/soin|beauty|skincare|cosmétique|cosmetic/.test(text)) return "beauty";
  if (/tech|app|logiciel|software|outil numérique/.test(text)) return "technology";
  if (/food|aliment|café|coffee|recette/.test(text)) return "food";
  if (/sport|fitness|yoga/.test(text)) return "wellness";
  return "general";
}
function chooseMusic(categoryName: string): string {
  // Stable ordered ranking: instrumental proof + soft texture; playful drum-led pop penalized for masking speech.
  if (categoryName === "technology" && SLIDESHOW_MUSIC_METADATA["sb-ephemera"]?.tags.includes("electronics")) return "sb-ephemera";
  const preferences: Record<string, string[]> = { books: ["reflective", "intimate", "dreamlike", "ambient"], beauty: ["warm", "nostalgic", "dreamlike", "ambient"], technology: ["electronics", "synth", "reflective", "ambient"], food: ["warm", "happy", "piano", "ambient"], wellness: ["ambient", "reflective", "dreamlike"], general: ["reflective", "intimate", "dreamlike", "ambient"] };
  return LICENSED_MUSIC.map(t => ({ id: t.id, tags: SLIDESHOW_MUSIC_METADATA[t.id]?.tags ?? [] }))
    .sort((a, b) => score(b.tags, preferences[categoryName]) - score(a.tags, preferences[categoryName]) || a.id.localeCompare(b.id))[0]?.id ?? "";
}
function score(tags: string[], prefs: string[]) { return (tags.includes("instrumental") ? 5 : 0) + prefs.reduce((n, tag, i) => n + (tags.includes(tag) ? (prefs.length - i) * 8 : 0), 0) - (tags.includes("drums") || tags.includes("percussion") ? 4 : 0); }

export function buildSlideshowVoicePlan(product: { name: string; description?: string }, duration: number, locale = "fr", goal: unknown = "discover", measuredBudget?: { minimumWords: number; maxWords: number }): SlideshowVoicePlan {
  const name = product.name?.trim().slice(0, 200);
  const description = typeof product.description === "string" ? product.description : "";
  const language = resolveProductLanguage({ name: product.name, description }, locale).code;
  // Estimate natural delivery at 2.0–2.6 words/sec across the required 95% voice window.
  // Require 20% extra source material so a short rendered clip does not fail after images are paid for.
  const speakingWindow = duration * 0.95;
  const baseMinimumWords = Math.ceil(speakingWindow * 2.0);
  const minimumSourceWords = Math.ceil(baseMinimumWords * 1.2);
  const minimumWords = measuredBudget?.minimumWords ?? baseMinimumWords;
  const maxWords = measuredBudget?.maxWords ?? Math.floor(speakingWindow * 2.6);
  if (!Number.isFinite(minimumWords) || !Number.isFinite(maxWords) || minimumWords <= 0 || maxWords < minimumWords) throw new Error("Invalid narration word budget");
  const wordCount = (part: string) => part.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount(name) > maxWords) throw new Error("Nom du produit trop long pour le budget vocal de cette durée; TTS non lancé.");
  // Reuse slideshow validator, with inferred locale and its required complete, distinct evidence.
  buildSlideshowPlan({ name, description, duration, aspectRatio: "1:1", locale, hasReference: false, character: "auto" });
  const narrationFacts = slideshowEvidence(description, name, Number.MAX_SAFE_INTEGER);
  const sourceWords = narrationFacts.reduce((count, sentence) => count + wordCount(sentence), 0);
  if (sourceWords < minimumSourceWords) throw new InsufficientProductDetailsError(
    `Description insuffisante pour une narration de ${duration}s : ${sourceWords} mots source exploitables, ${minimumSourceWords} requis avec marge. Aucune image ni aucun crédit consommé.`,
  );
  // Keep complete evidence sentences only; never clip a fact.
  const cta = language === "fr" || language === "en" ? buildSlideshowCta(name, slideshowSourceCandidates(description), campaignGoal(goal), language === "en") : (neutralProductCta(language) ?? name);
  if (wordCount(name) + wordCount(cta) > maxWords) throw new Error("Nom et CTA complet dépassent le budget vocal; TTS non lancé.");
  const accepted: string[] = [name];
  let words = wordCount(name) + wordCount(cta);
  // A hard lower word target ensures the selected runtime changes the narration
  // density. Evidence is used once, in source order; no invented/repeated filler.
  // Keep source-backed speech dense enough to approach the selected runtime;
  // actual rendered audio is independently checked for terminal silence.
  for (const part of narrationFacts) {
    const count = part.trim().split(/\s+/).filter(Boolean).length;
    if (words + count > maxWords) continue;
    if (measuredBudget && words >= minimumWords) break;
    accepted.push(part.trim()); words += count;
  }
  if (words < minimumWords) throw new InsufficientProductDetailsError(`Source insuffisante pour une narration couvrant ${duration}s (${words} mots disponibles, ${minimumWords} requis); TTS non lancé.`);
  const spokenFacts = accepted.map(part => part.replace(/[.!?]+$/g, ""));
  const script = `${spokenFacts.join(". ")}. ${cta.replace(/[.!?]+$/g, "")}.`;
  const kind = category(name, description);
  const tone = kind === "books" ? "chaleureux et narratif" : kind === "beauty" ? "doux et serein" : kind === "technology" ? "clair et posé" : kind === "food" ? "convivial et lumineux" : kind === "wellness" ? "calme et rassurant" : "naturel, clair et posé";
  return { script, language, musicId: chooseMusic(kind), model: SLIDESHOW_VOICE_MODEL, voice: language === "en" ? "Puck" : "Kore", duration, tone };
}

export async function synthesizeSlideshowVoice(plan: SlideshowVoicePlan, fetcher: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<Buffer> {
  assertSlideshowVoiceAllowed();
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, TIMEOUT_MS)));
  try {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${SLIDESHOW_VOICE_MODEL}:generateContent`, {
      method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      // Gemini 3.8 reads text verbatim; delivery directions belong in speech_metadata.
      body: JSON.stringify({ contents: [{ parts: [{ text: plan.script, speech_metadata: { style: plan.tone } }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: plan.voice } } } } }),
    });
    if (!response.ok) throw new GeminiVoiceError(classifyGeminiVoiceStatus(response.status), response.status);
    const data: any = await response.json();
    const inline = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
    if (inline?.mimeType !== "audio/wav" && inline?.mimeType !== "audio/x-wav" && inline?.mimeType !== "audio/L16;codec=pcm;rate=24000") throw new Error("Réponse Gemini absente ou non PCM 24 kHz mono.");
    if (typeof inline.data !== "string" || inline.data.length > Math.ceil(MAX_RESPONSE_BYTES * 4 / 3) + 8) throw new Error("Réponse audio Gemini dépassant la limite autorisée.");
    const audio = Buffer.from(inline.data, "base64");
    if (!audio.length || audio.length > MAX_RESPONSE_BYTES) throw new Error("Données audio trop volumineuses ou vides.");
    let wav: Buffer;
    if (audio.toString("ascii", 0, 4) === "RIFF" && audio.toString("ascii", 8, 12) === "WAVE") {
      wav = audio;
    } else if (inline.mimeType === "audio/L16;codec=pcm;rate=24000") {
      const header = Buffer.alloc(44);
      header.write("RIFF", 0); header.writeUInt32LE(36 + audio.length, 4); header.write("WAVE", 8);
      header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22); header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28);
      header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(audio.length, 40);
      wav = Buffer.concat([header, audio]);
    } else throw new Error("Gemini n'a pas renvoyé d'en-tête WAV valide.");
    if (wav.length > MAX_RESPONSE_BYTES || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 24_000 || wav.readUInt16LE(20) !== 1) throw new Error("WAV reçu invalide : attendu PCM mono 24 kHz.");
    return wav;
  } catch (error: any) {
    if (error instanceof GeminiVoiceError) throw error;
    const errorType = error instanceof Error ? error.constructor?.name || error.name || "Error" : error === null ? "null" : typeof error;
    console.warn("[studio] Gemini voice request outcome is uncertain", { errorType });
    throw new GeminiVoiceError("uncertain", null, error);
  } finally { clearTimeout(timer); }
}
