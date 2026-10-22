import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
import { prepareSlideshowVoice } from "@/lib/studio/slideshow";
import { synthesizeCoveredSlideshowVoice } from "@/lib/studio/slideshow-voice-retry";
const ffmpeg = "/usr/bin/ffmpeg", ffprobe = "/usr/bin/ffprobe";
const product = {
  name: "Guide Snapchat",
  description: "Guide pour lancer des campagnes sur Snapchat. Le guide explique les réglages du ciblage. Il présente plusieurs exemples de publicités. Chaque chapitre détaille une étape de préparation. Les exercices accompagnent la lecture du guide. Une section décrit les indicateurs de suivi. Le document explique les formats publicitaires disponibles. Une liste rassemble les vérifications avant publication. Le guide aide à définir les objectifs de chaque campagne. Des conseils présentent les audiences disponibles dans la plateforme. Les exemples montrent comment rédiger des annonces claires. Un chapitre décrit le calendrier de publication. Les tableaux récapitulent les résultats observés. Le lecteur peut comparer plusieurs formats de publicité. Des étapes expliquent comment préparer les visuels. Le guide détaille aussi le budget quotidien. Une partie aide à suivre les clics reçus. Les sections proposent des méthodes pour ajuster les campagnes. Les exemples couvrent les paramètres de ciblage avancés.",
};
const words = (text: string) => text.trim().split(/\s+/).length;
const probe = (file: string) => Number(execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { encoding: "utf8" }).trim());
describe("narration genuinely adapted to selected duration, fixture-only", () => {
  it("adds verified detail at 30s and 40s, preserving a complete product CTA at every duration", () => {
    const plans = [25, 30, 40].map(duration => buildSlideshowVoicePlan(product, duration, "fr", "buy"));
    expect(words(plans[0].script)).toBeLessThan(words(plans[1].script));
    expect(words(plans[1].script)).toBeLessThan(words(plans[2].script));
    for (const plan of plans) {
      expect(plan.script.endsWith("Prêt à lancer tes campagnes sur Snapchat ? Procure-toi le guide.")).toBe(true);
      expect(words(plan.script)).toBeGreaterThanOrEqual(Math.ceil(plan.duration * 0.95 * 2.0));
      expect(words(plan.script)).toBeLessThanOrEqual(Math.floor(plan.duration * 0.95 * 2.6));
      expect(plan.script).not.toMatch(/promotion|garanti|réserve|stock|révolutionnaire/i);
    }
  });
  it("rejects an impossible product name before requesting TTS", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(() => buildSlideshowVoicePlan({ ...product, name: Array.from({ length: 70 }, (_, i) => `mot${i}`).join(" ") }, 25)).toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("measures a 20.09s first response, rewrites and accepts a fitting mock response", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-retry-measured-"));
    try {
      const buffers: Buffer[] = [];
      for (const audible of [20.09, 24.3]) {
        const fixture = path.join(dir, `fixture-${audible}.wav`);
        execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=24000:duration=${audible}`, "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "25", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", fixture]);
        buffers.push(await readFile(fixture));
      }
      const synthesize = vi.fn().mockResolvedValueOnce(buffers[0]).mockResolvedValueOnce(buffers[1]);
      const result = await synthesizeCoveredSlideshowVoice(buildSlideshowVoicePlan(product, 25, "fr", "buy"), { product, campaignGoal: "buy" }, async (audio, attempt) => {
        const raw = path.join(dir, `attempt-${attempt}.wav`);
        await writeFile(raw, audio);
        return prepareSlideshowVoice(raw, ffmpeg, ffprobe, 25, dir);
      }, synthesize);
      expect(synthesize).toHaveBeenCalledTimes(2);
      expect(result.attempts).toBe(2);
      expect(result.plan.script.endsWith("Prêt à lancer tes campagnes sur Snapchat ? Procure-toi le guide.")).toBe(true);
      expect((await readFile(result.voicePath)).equals(buffers[1])).toBe(true);
      expect(words(result.plan.script)).toBeGreaterThan(words(synthesize.mock.calls[0][0].script));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000);
  it("fits a modest overrun naturally below 1.2x and preserves the raw source", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-natural-"));
    try {
      const raw = path.join(dir, "raw.wav");
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=24000:duration=27.7", raw]);
      const source = await readFile(raw);
      const adjusted = await prepareSlideshowVoice(raw, ffmpeg, ffprobe, 25, dir);
      expect(probe(adjusted)).toBeGreaterThanOrEqual(23.75);
      expect(probe(adjusted)).toBeLessThanOrEqual(24.65);
      expect(probe(raw) / probe(adjusted)).toBeLessThanOrEqual(1.2);
      expect((await readFile(raw)).equals(source)).toBe(true);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it.each([25, 30, 40])("accepts >=95% synthetic narration at %ss without truncating its source", async duration => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-timing-"));
    try {
      const raw = path.join(dir, "raw.wav");
      // Deterministic local sine fixture, not speech/provider generation.
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=24000:duration=${duration * 0.95}`, "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(duration), "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", "-c:a", "pcm_s16le", raw]);
      const source = await readFile(raw);
      const adjusted = await prepareSlideshowVoice(raw, ffmpeg, ffprobe, duration, dir);
      expect(adjusted).toBe(raw);
      expect(probe(adjusted)).toBeLessThanOrEqual(duration);
      expect(probe(raw) / probe(adjusted)).toBeLessThanOrEqual(1.2);
      expect((await readFile(raw)).equals(source)).toBe(true);
      // Already-fitting audio is preserved exactly, not unnecessarily accelerated.
      expect(await prepareSlideshowVoice(adjusted, ffmpeg, ffprobe, duration, dir)).toBe(adjusted);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000);
  it("rejects an unintelligible overrun instead of cutting speech or forcing excessive tempo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-overrun-"));
    try {
      const raw = path.join(dir, "raw.wav");
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=24000:duration=35", raw]);
      await expect(prepareSlideshowVoice(raw, ffmpeg, ffprobe, 25, dir)).rejects.toThrow(/maximum 1.2x.*without truncation/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("rejects a clip with a long terminal silent tail despite a 25s container duration", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-tail-"));
    try {
      const raw = path.join(dir, "tail.wav");
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=24000:duration=11.5", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "25", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", raw]);
      await expect(prepareSlideshowVoice(raw, ffmpeg, ffprobe, 25, dir)).rejects.toThrow(/trop courte: audible seulement jusqu'à 11\.5.*minimum 95%, soit 23\.75/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
