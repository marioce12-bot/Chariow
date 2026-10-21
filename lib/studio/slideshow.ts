import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type SlideshowOptions = {
  ffmpegPath: string;
  ffprobePath: string;
  outputPath: string;
  duration: number;
  imagePaths: string[];
  musicPath?: string;
  transitionDuration?: number;
  width?: number;
  height?: number;
  fps?: number;
  attribution?: string;
};

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", error => reject(new Error(`Unable to run ${binary}: ${error.message}`)));
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${binary} exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

async function probeDuration(file: string, ffprobe: string): Promise<number> {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  return Number(raw);
}

/**
 * Assemble a local-image slideshow. Image generation is deliberately outside this module.
 * Requires explicitly provisioned ffmpeg/ffprobe binaries; these are not provisioned by default on Vercel workers.
 */
export async function assembleSlideshow(options: SlideshowOptions): Promise<{ url: string; duration: number }> {
  const { ffmpegPath, ffprobePath, outputPath, imagePaths } = options;
  const total = options.duration;
  const transition = options.transitionDuration ?? 0.6;
  const width = options.width ?? 1280, height = options.height ?? 720, fps = options.fps ?? 30;
  if (!ffmpegPath || !ffprobePath) throw new Error("ffmpegPath and ffprobePath are required explicitly");
  if (!path.isAbsolute(outputPath)) throw new Error("outputPath must be absolute");
  if (!Array.isArray(imagePaths) || imagePaths.length < 2 || imagePaths.some(p => !path.isAbsolute(p))) throw new Error("Provide at least two local absolute imagePaths");
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(transition) || transition <= 0) throw new Error("duration and transitionDuration must be positive");
  if (transition * (imagePaths.length - 1) >= total) throw new Error("Transitions must be shorter than the total slideshow duration");
  if (width < 2 || height < 2 || fps < 1) throw new Error("Invalid output dimensions or frame rate");
  await Promise.all([...imagePaths, ...(options.musicPath ? [options.musicPath] : [])].map(async file => {
    if (!path.isAbsolute(file)) throw new Error(`Input must be a local absolute path: ${file}`);
    await stat(file);
  }));

  // xfade consumes transitionDuration seconds per join, so each image spans (total + overlaps) / count.
  const imageSpan = (total + transition * (imagePaths.length - 1)) / imagePaths.length;
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-slideshow-"));
  try {
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1"];
    for (const image of imagePaths) args.push("-loop", "1", "-t", String(imageSpan), "-i", image);
    if (options.musicPath) args.push("-stream_loop", "-1", "-i", options.musicPath);
    const filters: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      filters.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS,fps=${fps}[v${i}]`);
    }
    let previous = "v0";
    for (let i = 1; i < imagePaths.length; i++) {
      const next = `mix${i}`;
      const offset = imageSpan * i - transition * i;
      filters.push(`[${previous}][v${i}]xfade=transition=fade:duration=${transition}:offset=${offset}[${next}]`);
      previous = next;
    }
    args.push("-filter_complex", filters.join(";"), "-map", `[${previous}]`);
    if (options.musicPath) args.push("-map", `${imagePaths.length}:a:0`, "-af", `aresample=48000,volume=0.35,afade=t=out:st=${Math.max(0, total - 0.35)}:d=0.35`, "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
    if (options.attribution) args.push("-metadata", `comment=${options.attribution}`, "-metadata", `description=${options.attribution}`);
    args.push("-t", String(total), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-r", String(fps), "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath);
    await run(ffmpegPath, args);
    const actual = await probeDuration(outputPath, ffprobePath);
    if (!Number.isFinite(actual) || Math.abs(actual - total) > Math.max(0.08, 1 / fps)) throw new Error(`Slideshow duration ${actual}s differs from requested ${total}s`);
    return { url: outputPath, duration: actual };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
