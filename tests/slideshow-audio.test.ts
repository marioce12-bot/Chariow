import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { slideshowAudioFilter } from "../lib/studio/slideshow-audio";

const ffmpeg = "/usr/bin/ffmpeg";
const ffprobe = "/usr/bin/ffprobe";
const dirs: string[] = [];
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(out + err) : reject(new Error(`${bin}: ${err}`)));
  });
}
async function temp() { const d = await mkdtemp(path.join(tmpdir(), "vendeo-audio-test-")); dirs.push(d); return d; }
afterAll(async () => { await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true }))); });

describe("slideshow music loudness pipeline (real ffmpeg)", () => {
  it("raises a weak music source toward -16 LUFS without AAC clipping", async () => {
    const d = await temp(), source = path.join(d, "weak.wav"), output = path.join(d, "normalized.m4a");
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=5", "-af", "volume=0.01", source]);
    const before = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", source, "-af", "ebur128=framelog=verbose", "-f", "null", "-"]);
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-af", slideshowAudioFilter(5), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", output]);
    const stats = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", output, "-af", "ebur128=framelog=verbose,astats=metadata=1:reset=0", "-f", "null", "-"]);
    const inputLufs = Number(before.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
    const outputLufs = Number(stats.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
    const peak = Number(stats.match(/Peak level dB:\s*(-?[\d.]+)/)?.[1]);
    expect(inputLufs).toBeLessThan(-45);
    expect(outputLufs).toBeGreaterThan(-19);
    expect(outputLufs).toBeLessThan(-13);
    expect(outputLufs - inputLufs).toBeGreaterThan(25);
    expect(peak).toBeLessThanOrEqual(-1.0);
  }, 60_000);

  it("keeps hot-source AAC true peaks below full scale", async () => {
    const d = await temp(), source = path.join(d, "hot.wav"), output = path.join(d, "hot.m4a");
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=1:sample_rate=48000:duration=5:seed=42", source]);
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-af", slideshowAudioFilter(5), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", output]);
    const stats = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", output, "-af", "ebur128=peak=true:framelog=verbose", "-f", "null", "-"]);
    const peak = Number(stats.match(/Peak:\s*(-?[\d.]+) dBFS/)?.[1]);
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(-0.5);
  }, 60_000);

  it("remixes AAC audio while copying the original video bitstream", async () => {
    const d = await temp(), source = path.join(d, "source.mp4"), music = path.join(d, "music.wav"), output = path.join(d, "remix.mp4");
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=24:d=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-af", "volume=0.02", music]);
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-stream_loop", "-1", "-i", music, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", slideshowAudioFilter(4), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", "4", output]);
    const streams = await run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", output]);
    expect(streams).toContain("h264,video");
    expect(streams).toContain("aac,audio");
    const sourceHash = (await run(ffmpeg, ["-v", "error", "-i", source, "-map", "0:v:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"])).trim();
    const remixHash = (await run(ffmpeg, ["-v", "error", "-i", output, "-map", "0:v:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"])).trim();
    expect(remixHash).toBe(sourceHash);
  }, 60_000);
});
