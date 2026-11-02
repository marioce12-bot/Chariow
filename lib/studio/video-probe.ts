import { spawn } from "node:child_process";

export type VideoProbeResult = {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  audioDuration: number;
};

function run(binary: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", error => reject(new Error(`Unable to run ffprobe: ${error.message}`)));
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`ffprobe exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

export async function probeVideoFile(filePath: string, ffprobePath: string): Promise<VideoProbeResult> {
  const raw = await run(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height,duration",
    "-of", "json",
    filePath,
  ]);
  const result = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
  };
  const streams = result.streams ?? [];
  const video = streams.find(stream => stream.codec_type === "video");
  const audio = streams.find(stream => stream.codec_type === "audio");
  return {
    duration: Number(result.format?.duration),
    width: Number(video?.width),
    height: Number(video?.height),
    hasAudio: Boolean(audio),
    audioDuration: audio ? Number(audio.duration ?? result.format?.duration) : 0,
  };
}

export function validateFinalPortraitVideo(probe: VideoProbeResult) {
  if (!Number.isFinite(probe.duration) || Math.abs(probe.duration - 25) > 0.05) {
    throw new Error(`Durée finale hors contrat (25 s requises; reçues ${probe.duration}s).`);
  }
  if (!Number.isFinite(probe.width) || !Number.isFinite(probe.height) || Math.abs(probe.width / probe.height - 9 / 16) > 0.005) {
    throw new Error(`Le résultat final n’est pas en portrait 9:16 (${probe.width}×${probe.height}).`);
  }
  if (!probe.hasAudio || !Number.isFinite(probe.audioDuration) || probe.audioDuration < 24.8) {
    throw new Error("La piste audio manque ou ne couvre pas la durée finale; le résultat ne sera pas publié.");
  }
}
