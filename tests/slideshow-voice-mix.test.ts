import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { assembleSlideshow } from "../lib/studio/slideshow";

const ffmpeg = "/usr/bin/ffmpeg";
const ffprobe = "/usr/bin/ffprobe";
function run(binary: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(binary, args); let out = "", err = "";
    proc.stdout.on("data", x => out += x); proc.stderr.on("data", x => err += x);
    proc.on("error", reject); proc.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  });
}
function musicLevel(file: string, start: number) {
  return new Promise<number>((resolve, reject) => {
    const proc = spawn(ffmpeg, ["-hide_banner", "-ss", String(start), "-i", file, "-t", "4", "-vn", "-af", "bandpass=f=440:width_type=h:width=20,volumedetect", "-f", "null", "-"]);
    let err = "";
    proc.stderr.on("data", x => err += x);
    proc.on("error", reject);
    proc.on("close", code => {
      const match = err.match(/mean_volume: ([-\d.]+) dB/);
      if (code !== 0 || !match) reject(new Error(err)); else resolve(Number(match[1]));
    });
  });
}
describe("slideshow voice mix", () => {
  it("produces full-length AAC audio with voice alone and with ducked music; rejects truncation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "voice-mix-test-"));
    try {
      const images = ["one.png", "two.png"].map(name => path.join(dir, name));
      for (let i = 0; i < images.length; i++) await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${i ? "red" : "blue"}:s=160x90:d=14`, "-frames:v", "1", images[i]]);
      const voice = path.join(dir, "voice.wav"), music = path.join(dir, "music.wav"), tooLong = path.join(dir, "long.wav");
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=8", voice]);
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=28", music]);
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=35", tooLong]);
      for (const [name, extra] of [["voice-only.mp4", { voicePath: voice }], ["mixed.mp4", { voicePath: voice, musicPath: music }]] as const) {
        const output = path.join(dir, name);
        const result = await assembleSlideshow({ ffmpegPath: ffmpeg, ffprobePath: ffprobe, outputPath: output, duration: 25, imagePaths: images, width: 160, height: 90, fps: 2, profileSeed: 42, ...extra });
        expect(result.duration).toBeGreaterThanOrEqual(24.9);
        expect(result.duration).toBeLessThanOrEqual(25.1);
        const streams = await run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", output]);
        expect(streams).toContain("aac,audio");
        if (name === "mixed.mp4") {
          const duringSpeech = await musicLevel(output, 2);
          const afterSpeech = await musicLevel(output, 13);
          expect(afterSpeech - duringSpeech).toBeGreaterThan(3);
        }
      }
      await expect(assembleSlideshow({ ffmpegPath: ffmpeg, ffprobePath: ffprobe, outputPath: path.join(dir, "bad.mp4"), duration: 25, imagePaths: images, width: 160, height: 90, fps: 2, voicePath: tooLong })).rejects.toThrow(/too long for intelligible playback/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 120_000);
});
