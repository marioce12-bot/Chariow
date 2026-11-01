import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import ffmpeg from "ffmpeg-static";
import { assembleSlideshow } from "@/lib/studio/slideshow";
const ffprobe = require("ffprobe-static").path as string;
const exec = promisify(execFile);
it("renders an exactly five-image synthetic vertical MP4 with the packaged Vercel binaries and embedded attribution", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vendeo-bundled-test-"));
  try {
    const images = [];
    for (const color of ["red", "green", "blue", "yellow", "purple"]) {
      const file = path.join(directory, `${color}.png`); images.push(file);
      await exec(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=90x160:d=0.1`, "-frames:v", "1", file]);
    }
    const audio = path.join(directory, "sine.wav");
    await exec(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=5", audio]);
    const output = path.join(directory, "render.mp4"); const attribution = "Synthetic test soundtrack. Source: local sine, no third-party music.";
    await assembleSlideshow({ ffmpegPath: ffmpeg!, ffprobePath: ffprobe, imagePaths: images, musicPath: audio, duration: 25, width: 180, height: 320, fps: 25, outputPath: output, attribution, profileSeed: "bundled-fixture" });
    const { stdout } = await exec(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", output]);
    const data = JSON.parse(stdout); const video = data.streams.find((stream: any) => stream.codec_type === "video");
    expect(video.width).toBe(180); expect(video.height).toBe(320); expect(Number(data.format.duration)).toBeCloseTo(25, 1);
    expect(data.streams.some((stream: any) => stream.codec_type === "audio")).toBe(true);
    expect(data.format.tags.comment).toBe(attribution); expect(data.format.tags.description).toBe(attribution);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
