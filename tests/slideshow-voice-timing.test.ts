import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
import { prepareSlideshowVoice } from "@/lib/studio/slideshow";
const ffmpeg = "/usr/bin/ffmpeg", ffprobe = "/usr/bin/ffprobe";
const product = {
  name: "Guide Snapchat",
  description: "Guide pour lancer des campagnes sur Snapchat. Le guide explique les réglages du ciblage. Il présente plusieurs exemples de publicités. Chaque chapitre détaille une étape de préparation. Les exercices accompagnent la lecture du guide. Une section décrit les indicateurs de suivi. Le document explique les formats publicitaires disponibles. Une liste rassemble les vérifications avant publication.",
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
      expect(words(plan.script)).toBeLessThanOrEqual(Math.floor((plan.duration - 0.75) * 1.65));
      expect(plan.script).not.toMatch(/promotion|garanti|réserve|stock|révolutionnaire/i);
    }
  });
  it("rejects an impossible product name before requesting TTS", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(() => buildSlideshowVoicePlan({ ...product, name: Array.from({ length: 42 }, () => "mot").join(" ") }, 25)).toThrow(/budget vocal/);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([25, 30, 40])("measures and fits a modest audio overrun before %ss without truncating its source", async duration => {
    const dir = await mkdtemp(path.join(tmpdir(), "studio-voice-timing-"));
    try {
      const raw = path.join(dir, "raw.wav");
      // Deterministic local sine fixture, not speech/provider generation.
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=24000:duration=${duration}`, "-c:a", "pcm_s16le", raw]);
      const source = await readFile(raw);
      const adjusted = await prepareSlideshowVoice(raw, ffmpeg, ffprobe, duration, dir);
      expect(adjusted).not.toBe(raw);
      expect(probe(adjusted)).toBeLessThanOrEqual(duration - 0.75);
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
      await expect(prepareSlideshowVoice(raw, ffmpeg, ffprobe, 25, dir)).rejects.toThrow(/audible seulement jusqu'à 11\.5.*minimum 22\.00/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
