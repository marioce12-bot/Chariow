import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleSlideshow } from "../lib/studio/slideshow";

const ffmpeg = "/usr/bin/ffmpeg", ffprobe = "/usr/bin/ffprobe";
function command(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(Error(`${bin} exited ${code}`)));
  });
}
function samplePixel(file: string, second: number): Promise<[number, number, number]> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(second), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(Error(`sample ffmpeg exited ${code}`));
      const raw = Buffer.concat(chunks);
      resolve([raw[0], raw[1], raw[2]]);
    });
  });
}

describe("assembleSlideshow (real ffmpeg)", () => {
  it("exports four distinct local images with a real blend, exact 60s duration and local music", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vendeo-slideshow-test-"));
    try {
      const colors = ["red", "green", "blue", "yellow"];
      const images: string[] = [];
      for (let i = 0; i < colors.length; i++) {
        const image = path.join(dir, `${i}.png`);
        await command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${colors[i]}:s=160x90:d=0.1`, "-frames:v", "1", image]);
        images.push(image);
      }
      const music = path.join(dir, "music.wav");
      await command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", music]);
      const output = path.join(dir, "slideshow.mp4");
      const result = await assembleSlideshow({ ffmpegPath: ffmpeg, ffprobePath: ffprobe, imagePaths: images, musicPath: music, outputPath: output, duration: 60, width: 160, height: 90, fps: 24, transitionDuration: 0.6 });
      expect(result.url).toBe(output);
      expect(result.duration).toBeGreaterThanOrEqual(59.9);
      expect(result.duration).toBeLessThanOrEqual(60.1);

      const [r, g, b] = await samplePixel(output, 15.15); // halfway through the first 0.6s xfade
      expect(r, `expected a red/green blend, got RGB ${r},${g},${b}`).toBeGreaterThan(30);
      expect(g, `expected a red/green blend, got RGB ${r},${g},${b}`).toBeGreaterThan(30);
      expect(b, `expected little blue in first transition, got RGB ${r},${g},${b}`).toBeLessThan(60);
      const probe = await new Promise<string>((resolve, reject) => {
        const child = spawn(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", output]);
        const chunks: Buffer[] = [];
        child.stdout.on("data", chunk => chunks.push(chunk));
        child.on("error", reject);
        child.on("close", code => code === 0 ? resolve(Buffer.concat(chunks).toString()) : reject(Error(`ffprobe exited ${code}`)));
      });
      expect(probe).toContain("audio");
      for (const second of [5, 25, 40, 55]) {
        const [sr, sg, sb] = await samplePixel(output, second);
        const [er, eg, eb] = [[255, 0, 0], [0, 128, 0], [0, 0, 255], [255, 255, 0]][[5, 25, 40, 55].indexOf(second)];
        expect(Math.abs(sr - er) + Math.abs(sg - eg) + Math.abs(sb - eb)).toBeLessThan(120);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 180_000);
});
