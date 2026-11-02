import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export type VideoBinaries = { ffmpegPath: string; ffprobePath: string };

/** Resolve package-provided binaries only: Vercel does not guarantee system ffmpeg. */
export function packagedVideoBinaries(): VideoBinaries | null {
  try {
    const ffprobePath = ffprobeStatic.path;
    if (!ffmpegPath || !ffprobePath || !existsSync(ffmpegPath) || !existsSync(ffprobePath)) return null;
    return { ffmpegPath, ffprobePath };
  } catch {
    return null;
  }
}
