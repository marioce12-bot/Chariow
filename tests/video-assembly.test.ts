import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleVideo } from "../lib/studio/video-assembly";
import type { VideoAdPlan } from "../lib/studio/video-plan";
import type { VideoClip } from "../lib/studio/video-pipeline";

const ffmpeg = "/usr/bin/ffmpeg", ffprobe = "/usr/bin/ffprobe";
function command(bin: string, args: string[]) { return new Promise<void>((resolve, reject) => { const p = spawn(bin, args, { stdio: "ignore" }); p.on("error", reject); p.on("close", c => c === 0 ? resolve() : reject(Error(`${bin} exited ${c}`))); }); }

describe("assembleVideo (real ffmpeg)", () => {
  it("normalizes and concatenates two 15s synthetic clips into exactly 30s", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vendeo-test-"));
    try {
      const colors = ["red", "blue"];
      const durations = [15, 15];
      const clips: VideoClip[] = [];
      for (let i = 0; i < colors.length; i++) {
        const file = path.join(dir, `source-${i}.mp4`);
        const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${colors[i]}:s=320x180:r=24:d=${durations[i]}`];
        if (i !== 1) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-shortest");
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
        if (i !== 1) args.push("-c:a", "aac");
        args.push(file);
        await command(ffmpeg, args);
        clips.push({ url: file, duration: durations[i], index: i });
      }
      const plan = { duration: 30, aspectRatio: "16:9", direction: "", continuity: "", segments: durations.map((duration, index) => ({ index, duration, prompt: "test" })) } as VideoAdPlan;
      const output = path.join(dir, "assembled.mp4");
      const result = await assembleVideo(clips, plan, { ffmpegPath: ffmpeg, ffprobePath: ffprobe, outputPath: output, width: 320, height: 180, fps: 24 });
      expect(result.duration).toBeGreaterThanOrEqual(29.95);
      expect(result.duration).toBeLessThanOrEqual(30.05);
      for (let i = 0; i < 2; i++) {
        const raw = await new Promise<Buffer>((resolve, reject) => {
          const p = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(i === 0 ? 5 : 20), "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
          const chunks: Buffer[] = []; p.stdout.on("data", d => chunks.push(d)); p.on("error", reject); p.on("close", c => c === 0 ? resolve(Buffer.concat(chunks)) : reject(Error(`sample ffmpeg exited ${c}`)));
        });
        const pixel = raw.subarray((90 * 320 + 160) * 3, (90 * 320 + 160) * 3 + 3);
        const [r, g, b] = pixel;
        const expected = [[255, 0, 0], [0, 0, 255]][i];
        const distance = Math.abs(r - expected[0]) + Math.abs(g - expected[1]) + Math.abs(b - expected[2]);
        expect(distance, `wrong color/order at ${i === 0 ? 5 : 20}s (RGB ${r},${g},${b})`).toBeLessThan(100);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 180_000);

  it.each([
    [10, [10]],
    [15, [15]],
    [25, [15, 10]],
    [30, [15, 15]],
  ])("accepts a valid %i-second clip plan", async (duration, segmentDurations) => {
    const plan = { duration, aspectRatio: "9:16", direction: "", continuity: "", segments: segmentDurations.map((segmentDuration, index) => ({ index, duration: segmentDuration, prompt: "test" })) } as VideoAdPlan;
    await expect(assembleVideo([], plan, { outputPath: "/tmp/video.mp4" })).rejects.toThrow("Set ffmpegPath and ffprobePath");
  });

  it("rejects unsupported or mismatched plans before requiring ffmpeg", async () => {
    const unsupported = { duration: 42, aspectRatio: "9:16", direction: "", continuity: "", segments: [15, 15].map((duration, index) => ({ index, duration, prompt: "test" })) } as VideoAdPlan;
    const mismatched = { duration: 10, aspectRatio: "9:16", direction: "", continuity: "", segments: [{ index: 0, duration: 15, prompt: "test" }] } as VideoAdPlan;
    await expect(assembleVideo([], unsupported, { outputPath: "/tmp/video.mp4" })).rejects.toThrow(/durée vidéo prise en charge/);
    await expect(assembleVideo([], mismatched, { outputPath: "/tmp/video.mp4" })).rejects.toThrow(/totalisent cette durée/);
  });
});
