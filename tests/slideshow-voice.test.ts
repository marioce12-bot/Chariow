import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSlideshowVoiceAllowed, buildSlideshowVoicePlan, SLIDESHOW_MUSIC_METADATA, slideshowVoiceAvailability, synthesizeSlideshowVoice } from "@/lib/studio/slideshow-voice";

afterEach(() => { delete process.env.VERCEL_ENV; delete process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED; delete process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED; delete process.env.GEMINI_API_KEY; delete process.env.VENDEO_SLIDESHOW_TTS_ENABLED; });
const product = { name: "Carnet créatif", description: "Livre illustré avec 120 pages. Papier recyclé certifié. Reliure cousue durable. Format compact pour le voyage." };
describe("slideshow voice", () => {
  it("blocks before the network unless preview and both explicit gates are true", async () => {
    expect(slideshowVoiceAvailability().available).toBe(false);
    const fetcher = vi.fn();
    await expect(synthesizeSlideshowVoice({} as any, fetcher as any)).rejects.toThrow(/preview/);
    expect(fetcher).not.toHaveBeenCalled();
    process.env.VERCEL_ENV = "preview";
    process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED = "true";
    expect(() => assertSlideshowVoiceAllowed()).toThrow(/palier gratuit/);
    process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED = "true";
    process.env.VERCEL_ENV = "production";
    expect(() => assertSlideshowVoiceAllowed()).toThrow(/activée/);
    process.env.VENDEO_SLIDESHOW_TTS_ENABLED = "true";
    expect(() => assertSlideshowVoiceAllowed()).not.toThrow();
    expect(slideshowVoiceAvailability().available).toBe(true);
  });
  it("uses verified facts, infers language, and points metadata to official sources", () => {
    const plan = buildSlideshowVoicePlan(product, 25, "en");
    expect(plan.language).toBe("fr");
    expect(plan.script).toContain("120 pages");
    expect(plan.script).not.toMatch(/garanti|best|révolutionnaire/i);
    const english = buildSlideshowVoicePlan({ name: "Travel organizer", description: "A compact planner with 120 pages. Recycled paper certified. Stitched binding built to last. Portable format for travel." }, 25, "fr");
    expect(english.language).toBe("en");
    const tech = buildSlideshowVoicePlan({ name: "Tech planner", description: "Software app with cloud sync. Works offline on devices. Includes encrypted backup. Compatible with desktop systems." }, 25, "en");
    expect(tech.musicId).not.toBe(english.musicId);
    expect(Object.keys(SLIDESHOW_MUSIC_METADATA)).toContain("sb-reverie");
    expect(Object.values(SLIDESHOW_MUSIC_METADATA).every(entry => entry.sourceUrl.startsWith("https://www.scottbuckley.com.au/library/"))).toBe(true);
    expect(plan.musicId).toBeTruthy();
  });
  it.each([25, 30, 40])( "keeps narration within a conservative spoken-word budget for %ss", (duration) => {
    const plan = buildSlideshowVoicePlan(product, duration);
    const words = plan.script.trim().split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(Math.floor((duration - 0.75) * 1.65));
    expect(plan.duration).toBe(duration);
  });
  it("makes one mock Gemini request and returns valid bounded WAV bytes", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED = "true";
    process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED = "true";
    process.env.GEMINI_API_KEY = "test-only";
    const pcm = Buffer.alloc(8);
    const expected = Buffer.alloc(52); expected.write("RIFF", 0); expected.writeUInt32LE(44, 4); expected.write("WAVE", 8); expected.write("fmt ", 12); expected.writeUInt32LE(16, 16); expected.writeUInt16LE(1, 20); expected.writeUInt16LE(1, 22); expected.writeUInt32LE(24000, 24); expected.writeUInt32LE(48000, 28); expected.writeUInt16LE(2, 32); expected.writeUInt16LE(16, 34); expected.write("data", 36); expected.writeUInt32LE(8, 40);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }] }) });
    const result = await synthesizeSlideshowVoice({ script: "Bonjour.", language: "fr", voice: "Kore", tone: "posé" } as any, fetcher as any);
    expect(result.equals(expected)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("gemini-3.8-flash-tts");
  });
  it.each([
    product,
    { name: "Travel organizer", description: "A compact planner with 120 pages. Recycled paper certified. Stitched binding built to last. Portable format for travel." },
  ])("sends only the product narration as spoken text for $name", async (voiceProduct) => {
    process.env.VERCEL_ENV = "preview";
    process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED = "true";
    process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED = "true";
    process.env.GEMINI_API_KEY = "test-only";
    // Inspect a rejected mock request: no network call or audio generation.
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    const plan = buildSlideshowVoicePlan(voiceProduct, 25);
    await expect(synthesizeSlideshowVoice(plan, fetcher as any)).rejects.toThrow(/HTTP 400/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    const spokenText = request.contents.flatMap((content: any) => content.parts.map((part: any) => part.text ?? "")).join("");
    expect(spokenText).toBe(plan.script);
    expect(spokenText).toContain(voiceProduct.name);
    expect(spokenText).toContain("120 pages");
    for (const instruction of ["Regarde exactement ce script", "ton chaleureux et narratif", "Do not add any words", "Read exactly this script", "Tone:", plan.tone]) {
      expect(spokenText.toLowerCase()).not.toContain(instruction.toLowerCase());
    }
    expect(request.contents).toEqual([{ parts: [{ text: plan.script, speech_metadata: { style: plan.tone } }] }]);
    expect(request.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(plan.voice);
    expect(request.generationConfig.responseModalities).toEqual(["AUDIO"]);
  });
  it.each([403, 429])("stops on free-tier HTTP %s without retry or fallback", async (status) => {
    process.env.VERCEL_ENV = "preview";
    process.env.VENDEO_SLIDESHOW_TTS_TEST_ALLOWED = "true";
    process.env.VENDEO_GEMINI_FREE_TIER_CONFIRMED = "true";
    process.env.GEMINI_API_KEY = "test-only";
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status });
    await expect(synthesizeSlideshowVoice(buildSlideshowVoicePlan(product, 25), fetcher as any)).rejects.toThrow(/gratuit.*aucune relance/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-only");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("test-only");
  });
});
