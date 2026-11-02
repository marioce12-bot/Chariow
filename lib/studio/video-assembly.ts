import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { VideoAdPlan } from "./video-plan";
import type { VideoClip } from "./video-pipeline";

export type AssemblyOptions = { ffmpegPath?: string; ffprobePath?: string; outputPath: string; width?: number; height?: number; fps?: number };
function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
    child.on("error", e => reject(new Error(`Unable to run ${binary}: ${e.message}`)));
    child.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(`${binary} exited ${code}: ${err.slice(-3000)}`)));
  });
}
async function probe(file: string, ffprobe: string): Promise<{ duration: number; hasAudio: boolean }> {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=codec_type", "-of", "json", file]);
  const data = JSON.parse(raw);
  return { duration: Number(data.format?.duration), hasAudio: data.streams?.some((s: {codec_type:string}) => s.codec_type === "audio") ?? false };
}
function localPath(url: string): string {
  if (url.startsWith("file://")) return new URL(url).pathname;
  if (!path.isAbsolute(url)) throw new Error(`Clip must be a local absolute path or file URL: ${url}`);
  return url;
}

/** Requires explicitly provisioned ffmpeg/ffprobe binaries; not guaranteed in Vercel runtime. */
export async function assembleVideo(clips: VideoClip[], plan: VideoAdPlan, options: AssemblyOptions): Promise<{ url: string; duration: number }> {
  const ffmpeg = options.ffmpegPath ?? process.env.FFMPEG_PATH;
  const ffprobe = options.ffprobePath ?? process.env.FFPROBE_PATH;
  if (!ffmpeg || !ffprobe) throw new Error("Set ffmpegPath and ffprobePath explicitly (or FFMPEG_PATH/FFPROBE_PATH)");
  if (plan.duration !== 25 || plan.segments.length !== 2 || plan.segments[0]?.duration !== 15 || plan.segments[1]?.duration !== 10) throw new Error("Final video must be exactly 25 seconds from ordered 15s and 10s clips");
  if (clips.length !== plan.segments.length || clips.some((c, i) => c.index !== i || c.index !== plan.segments[i].index)) throw new Error("Clip count/order does not match plan");
  const width = options.width ?? 1280, height = options.height ?? 720, fps = options.fps ?? 30;
  if (width < 2 || height < 2 || fps < 1) throw new Error("Invalid output dimensions or frame rate");
  const paths = clips.map(c => localPath(c.url));
  await Promise.all(paths.map(async (p, i) => { await stat(p); const info = await probe(p, ffprobe); if (!Number.isFinite(info.duration) || info.duration + 0.02 < plan.segments[i].duration) throw new Error(`Clip ${i} is shorter than requested; refusing to speed up or loop`); }));
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-assembly-"));
  try {
    const normalized: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const out = path.join(work, `${i}.mp4`); normalized.push(out);
      const { hasAudio } = await probe(paths[i], ffprobe);
      const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`;
      const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", paths[i]];
      if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
      args.push("-t", String(plan.segments[i].duration), "-vf", filter, "-map", "0:v:0", "-map", hasAudio ? "0:a:0?" : "1:a:0", "-af", "aresample=48000,apad", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-r", String(fps), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", out);
      await run(ffmpeg, args);
    }
    const list = path.join(work, "concat.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(list, normalized.map(p => `file '${p.replaceAll("'", "'\\''")}'`).join("\n"));
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", options.outputPath]);
    const final = await probe(options.outputPath, ffprobe);
    if (!Number.isFinite(final.duration) || Math.abs(final.duration - 25) > 0.05) throw new Error(`Assembled duration ${final.duration}s differs from exact 25s requirement`);
    return { url: options.outputPath, duration: final.duration };
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** Extracts a PNG last frame to a temporary local path for downstream worker continuity. */
export async function extractLastFrame(clip: VideoClip, ffmpegPath: string): Promise<string> {
  const src = localPath(clip.url); const out = path.join(await mkdtemp(path.join(tmpdir(), "vendeo-frame-")), "last.png");
  await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-sseof", "-0.05", "-i", src, "-frames:v", "1", out]);
  return out;
}
