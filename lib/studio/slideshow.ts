import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { slideshowAudioFilter } from "./slideshow-audio";
import { buildNativeMotionScenes, chooseSlideshowMotionProfile } from "./slideshow-motion";
import { SlideshowVoiceTimingError } from "./slideshow-voice-retry";

export type SlideshowOptions = {
  ffmpegPath: string;
  ffprobePath: string;
  outputPath: string;
  duration: number;
  imagePaths: string[];
  musicPath?: string;
  voicePath?: string;
  transitionDuration?: number;
  width?: number;
  height?: number;
  fps?: number;
  attribution?: string;
  /** Optional deterministic seed for tests. */
  profileSeed?: string | number;
  /** Opt-in deterministic Vendeo-authored motion treatment; legacy rendering remains the default. */
  motionDesign?: boolean;
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

async function probeVoiceCoverage(file: string, ffmpeg: string, ffprobe: string): Promise<{ duration: number; audibleEnd: number }> {
  const duration = await probeDuration(file, ffprobe);
  const diagnostics = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-i", file, "-vn", "-af", "silencedetect=noise=-45dB:d=0.25", "-f", "null", "-"]);
    let stderr = "";
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg silence analysis failed: ${stderr.slice(-1000)}`)));
  });
  const starts = [...diagnostics.matchAll(/silence_start: ([\d.]+)/g)];
  const ends = [...diagnostics.matchAll(/silence_end: ([\d.]+)/g)];
  const lastStart = starts.length ? Number(starts.at(-1)![1]) : undefined;
  const lastEnd = ends.length ? Number(ends.at(-1)![1]) : undefined;
  // silencedetect closes a final silence at EOF, so equal start/end counts do
  // not mean the tail was audible. A terminal silence of >=250ms is rejected.
  const trailingStart = lastStart !== undefined && (lastEnd === undefined || lastEnd >= duration - 0.05) ? lastStart : duration;
  return { duration, audibleEnd: trailingStart };
}

/** Preserve the generated source; locally speed up only modest overruns, then verify the actual WAV duration. */
export async function prepareSlideshowVoice(rawAudio: string, ffmpegPath: string, ffprobePath: string, duration: number, workDir: string): Promise<string> {
  const minimumAudible = duration * 0.95;
  // Keep the final music fade clear of the last spoken syllable.
  const limit = duration - 0.35;
  const rawDuration = await probeDuration(rawAudio, ffprobePath);
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) throw new Error(`Invalid raw voice duration: ${rawDuration}s`);
  const coverage = await probeVoiceCoverage(rawAudio, ffmpegPath, ffprobePath);
  if (coverage.audibleEnd < minimumAudible) throw new SlideshowVoiceTimingError("short", coverage.audibleEnd, rawDuration, `Narration trop courte: audible seulement jusqu'à ${coverage.audibleEnd.toFixed(2)}s sur ${duration}s (minimum 95%, soit ${minimumAudible.toFixed(2)}s); voix rejetée plutôt que d'habiller un silence par la musique.`);
  if (rawDuration <= limit || (rawDuration <= duration && coverage.audibleEnd <= limit)) return rawAudio;
  // Leave 50ms for sample-frame rounding in the tempo filter, then remeasure.
  const tempo = rawDuration / (limit - 0.05);
  const maxTempo = 1.2;
  if (tempo > maxTempo) throw new SlideshowVoiceTimingError("long", coverage.audibleEnd, rawDuration, `Voice too long for intelligible playback: ${rawDuration}s requires ${tempo.toFixed(3)}x (maximum ${maxTempo}x); voice rejected without truncation`);
  const adjusted = path.join(workDir, "narration-adjusted.wav");
  await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", rawAudio, "-vn", "-filter:a", `atempo=${tempo.toFixed(6)}`, "-c:a", "pcm_s16le", adjusted]);
  const adjustedDuration = await probeDuration(adjusted, ffprobePath);
  if (!Number.isFinite(adjustedDuration) || adjustedDuration > limit) throw new Error(`Adjusted voice duration ${adjustedDuration}s exceeds safe limit ${limit}s; voice rejected without truncation`);
  const adjustedCoverage = await probeVoiceCoverage(adjusted, ffmpegPath, ffprobePath);
  if (adjustedCoverage.audibleEnd < minimumAudible) throw new SlideshowVoiceTimingError("short", adjustedCoverage.audibleEnd, adjustedDuration, `Narration ajustée audible seulement jusqu'à ${adjustedCoverage.audibleEnd.toFixed(2)}s (minimum ${minimumAudible.toFixed(2)}s); voix rejetée.`);
  return adjusted;
}

/**
 * Assemble a local-image slideshow. Image generation is deliberately outside this module.
 * Requires explicitly provisioned ffmpeg/ffprobe binaries; these are not provisioned by default on Vercel workers.
 */
export async function assembleSlideshow(options: SlideshowOptions): Promise<{ url: string; duration: number }> {
  const { ffmpegPath, ffprobePath, outputPath, imagePaths } = options;
  const total = options.duration;
  const transition = Math.min(options.transitionDuration ?? 0.8, 0.8);
  const width = options.width ?? 1280, height = options.height ?? 720, fps = options.fps ?? 30;
  if (!ffmpegPath || !ffprobePath) throw new Error("ffmpegPath and ffprobePath are required explicitly");
  if (!path.isAbsolute(outputPath)) throw new Error("outputPath must be absolute");
  if (!Array.isArray(imagePaths) || imagePaths.length < 2 || imagePaths.some(p => !path.isAbsolute(p))) throw new Error("Provide at least two local absolute imagePaths");
  if (!Number.isFinite(total) || total < 25 || !Number.isFinite(transition) || transition <= 0) throw new Error("Slideshow duration must be at least 25s and transitionDuration must be positive");
  if (transition * (imagePaths.length - 1) >= total) throw new Error("Transitions must be shorter than the total slideshow duration");
  if (width < 2 || height < 2 || fps < 1) throw new Error("Invalid output dimensions or frame rate");
  await Promise.all([...imagePaths, ...(options.musicPath ? [options.musicPath] : []), ...(options.voicePath ? [options.voicePath] : [])].map(async file => {
    if (!path.isAbsolute(file)) throw new Error(`Input must be a local absolute path: ${file}`);
    await stat(file);
  }));

  // Each still has its own full-reading dwell plus adjacent transition handles.
  const dwell = (total - transition * (imagePaths.length - 1)) / imagePaths.length;
  if (dwell < 4) throw new Error("Each image must remain fully visible for at least 4 seconds");
  const spans = imagePaths.map((_, index) => dwell + transition * (Number(index > 0) + Number(index < imagePaths.length - 1)));
  const profile = chooseSlideshowMotionProfile(options.profileSeed);
  const nativeScenes = options.motionDesign ? buildNativeMotionScenes(imagePaths.length, fps, transition) : undefined;
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-slideshow-"));
  try {
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1"];
    imagePaths.forEach((image, index) => args.push("-loop", "1", "-t", String(spans[index]), "-i", image));
    if (options.musicPath) args.push("-stream_loop", "-1", "-i", options.musicPath);
    if (options.voicePath) {
      const preparedVoice = await prepareSlideshowVoice(options.voicePath, ffmpegPath, ffprobePath, total, work);
      args.push("-i", preparedVoice);
    }
    const filters: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const scene = nativeScenes?.[i];
      const zoom = scene?.zoom ?? (profile.zoomDirection > 0 ? "min(zoom+0.00008,1.025)" : "if(eq(on,1),1.025,max(zoom-0.00008,1))");
      const x = scene?.x ?? "iw/2-(iw/zoom/2)", y = scene?.y ?? "ih/2-(ih/zoom/2)";
      filters.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps},settb=AVTB,setpts=PTS-STARTPTS,fps=${fps}[v${i}]`);
    }
    let previous = "v0";
    for (let i = 1; i < imagePaths.length; i++) {
      const next = `mix${i}`;
      const offset = dwell * i + transition * (i - 1);
      const effect = nativeScenes?.[i].transition ?? profile.transitions[(i - 1) % profile.transitions.length];
      filters.push(`[${previous}][v${i}]xfade=transition=${effect}:duration=${transition}:offset=${offset}[${next}]`);
      previous = next;
    }
    if (nativeScenes) {
      // Slim, continuous edge treatment only: no copy, face/body overlays, or
      // interference with baked-in text. The accent reaches full width at end.
      // drawbox's `t` means thickness, not time. overlay evaluates `t` per frame.
      filters.push(`color=c=0x50E3C2:s=${width}x2:r=${fps}:d=${total}[progress]`);
      filters.push(`[${previous}]drawbox=x=0:y=ih-8:w=iw:h=2:color=white@0.24:t=fill[bordered]`);
      filters.push(`[bordered][progress]overlay=x='-overlay_w+overlay_w*min(t/${total},1)':y=main_h-8:eval=frame:shortest=1[designed]`);
      previous = "designed";
    }
    if (options.voicePath) {
      const voiceIndex = imagePaths.length + Number(Boolean(options.musicPath));
      const audio: string[] = [`[${voiceIndex}:a]aresample=48000,loudnorm=I=-16:TP=-2:LRA=11:print_format=none,alimiter=limit=0.841395:level=false,apad,atrim=duration=${total},asetpts=PTS-STARTPTS[voice]`];
      if (options.musicPath) {
        audio.push(`[voice]asplit=2[spoken][voicekey]`);
        // Normalize quiet licensed tracks before speech ducking; source beds can be extremely quiet.
        // Lift very weak non-silent sources above loudnorm's absolute gating
        // threshold first; loudnorm alone leaves below-gate music inaudible.
        audio.push(`[${imagePaths.length}:a]aresample=48000,dynaudnorm=m=100,loudnorm=I=-18:TP=-2:LRA=11,volume=0.25[music]`);
        audio.push(`[music][voicekey]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=350[ducked]`);
        audio.push(`[spoken][ducked]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.841395:level=false,atrim=duration=${total},afade=t=out:st=${Math.max(0,total-0.35)}:d=0.35[aout]`);
      } else audio.push(`[voice]alimiter=limit=0.841395:level=false,atrim=duration=${total},afade=t=out:st=${Math.max(0,total-0.35)}:d=0.35[aout]`);
      args.push("-filter_complex", [...filters, ...audio].join(";"), "-map", `[${previous}]`, "-map", "[aout]", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
    } else {
      args.push("-filter_complex", filters.join(";"), "-map", `[${previous}]`);
      if (options.musicPath) args.push("-map", `${imagePaths.length}:a:0`, "-af", slideshowAudioFilter(total), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
    }
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
