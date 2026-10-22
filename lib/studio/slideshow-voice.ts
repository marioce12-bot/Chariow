import { Buffer } from "node:buffer";
import { buildSlideshowCta, buildSlideshowPlan, campaignGoal, slideshowEvidence, slideshowSourceCandidates } from "@/lib/studio/slideshow-plan";
import { LICENSED_MUSIC } from "@/lib/studio/licensed-music";

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
  const allowed = supported && enabled && process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED === "true";
  return { available: allowed, voiceoverEnabled: supported, voiceoverTestAllowed: allowed,
    environment: environment ?? "development", model: SLIDESHOW_VOICE_MODEL,
    reason: allowed ? undefined : "Voix off momentanément indisponible. Aucun appel vocal ni crédit supplémentaire consommé." };
}
export function assertSlideshowVoiceAllowed(): void {
  const environment = process.env.VERCEL_ENV;
  if (environment !== "preview" && environment !== "production") throw new Error("TTS diaporama réservé aux environnements preview ou production autorisés.");
  const enabled = process.env.VENDEO_SLIDESHOW_TTS_ENABLED === "true" ||
    (environment === "preview" && process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED === "true");
  if (!enabled) throw new Error("La voix off n’est pas encore activée dans cet environnement. Aucun appel vocal effectué.");
  if (process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED !== "true") throw new Error("Voix off bloquée : le palier gratuit Gemini doit être confirmé. Aucune offre payante utilisée.");
}

export type SlideshowVoicePlan = { script: string; language: "fr" | "en"; musicId: string; model: typeof SLIDESHOW_VOICE_MODEL; voice: string; duration: number; tone: string };
function inferLanguage(facts: string[], locale: string): "fr" | "en" {
  let fr = 0, en = 0;
  const frWords = /\b(le|la|les|des|une|avec|pour|dans|et|est|sont|du|sur|sans|livre|créé|offre|permet)\b/gi;
  const enWords = /\b(the|and|with|for|in|is|are|from|without|book|made|offers|helps|features)\b/gi;
  for (const fact of facts) { fr += (fact.match(frWords) ?? []).length; en += (fact.match(enWords) ?? []).length; }
  if (fr !== en) return fr > en ? "fr" : "en";
  return locale === "fr" ? "fr" : "en";
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

export function buildSlideshowVoicePlan(product: { name: string; description?: string }, duration: number, locale = "fr", goal: unknown = "discover"): SlideshowVoicePlan {
  const name = product.name?.trim().slice(0, 200);
  const description = typeof product.description === "string" ? product.description : "";
  const evidence = slideshowEvidence(description, name);
  const language = inferLanguage(evidence, locale);
  // Reserve 0.75s at 1.65 spoken words/sec; reject an impossible product name before any TTS stage.
  const maxWords = Math.max(1, Math.floor((duration - 0.75) * 1.65));
  const wordCount = (part: string) => part.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount(name) > maxWords) throw new Error("Nom du produit trop long pour le budget vocal de cette durée; TTS non lancé.");
  // Reuse slideshow validator, with inferred locale and its required complete, distinct evidence.
  buildSlideshowPlan({ name, description, duration, aspectRatio: "1:1", locale: language, hasReference: false, character: "auto" });
  // Keep complete evidence sentences only; never clip a fact. Budget at a deliberately
  // conservative 1.65 words/sec and reserve 0.75s for the natural ending/audio fade.
  const cta = buildSlideshowCta(name, slideshowSourceCandidates(description), campaignGoal(goal), language === "en");
  if (wordCount(name) + wordCount(cta) > maxWords) throw new Error("Nom et CTA complet dépassent le budget vocal; TTS non lancé.");
  const accepted: string[] = [name];
  let words = wordCount(name) + wordCount(cta);
  // A hard lower word target ensures the selected runtime changes the narration
  // density. Evidence is used once, in source order; no invented/repeated filler.
  // Keep source-backed speech dense enough to approach the selected runtime;
  // actual rendered audio is independently checked for terminal silence.
  const minimumWords = Math.ceil(duration * 0.9);
  for (const part of evidence) {
    const count = part.trim().split(/\s+/).filter(Boolean).length;
    if (words + count > maxWords) continue;
    accepted.push(part.trim()); words += count;
  }
  if (words < minimumWords) throw new Error(`Source insuffisante pour une narration couvrant ${duration}s (${words} mots disponibles, ${minimumWords} requis); TTS non lancé.`);
  const spokenFacts = accepted.map(part => part.replace(/[.!?]+$/g, ""));
  const script = `${spokenFacts.join(". ")}. ${cta.replace(/[.!?]+$/g, "")}.`;
  const kind = category(name, description);
  const tone = kind === "books" ? "chaleureux et narratif" : kind === "beauty" ? "doux et serein" : kind === "technology" ? "clair et posé" : kind === "food" ? "convivial et lumineux" : kind === "wellness" ? "calme et rassurant" : "naturel, clair et posé";
  return { script, language, musicId: chooseMusic(kind), model: SLIDESHOW_VOICE_MODEL, voice: language === "fr" ? "Kore" : "Puck", duration, tone };
}

export async function synthesizeSlideshowVoice(plan: SlideshowVoicePlan, fetcher: typeof fetch = fetch): Promise<Buffer> {
  assertSlideshowVoiceAllowed();
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${SLIDESHOW_VOICE_MODEL}:generateContent`, {
      method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      // Gemini 3.8 reads text verbatim; delivery directions belong in speech_metadata.
      body: JSON.stringify({ contents: [{ parts: [{ text: plan.script, speech_metadata: { style: plan.tone } }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: plan.voice } } } } }),
    });
    if (!response.ok) {
      if (response.status === 429 || response.status === 403) throw new Error("Quota ou accès Gemini gratuit indisponible; aucune relance ni bascule vers une offre payante n'est effectuée.");
      throw new Error(`Gemini TTS a répondu HTTP ${response.status}; aucun retry n'est effectué.`);
    }
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
    if (error?.name === "AbortError") throw new Error("Délai d'attente Gemini TTS dépassé; aucune relance car le résultat de la requête est incertain.");
    throw error;
  } finally { clearTimeout(timer); }
}
