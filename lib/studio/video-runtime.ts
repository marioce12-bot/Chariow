import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));

export type VideoBinaries = { ffmpegPath: string; ffprobePath: string };

/** Resolve package-provided binaries only: Vercel does not guarantee system ffmpeg. */
export function packagedVideoBinaries(): VideoBinaries | null {
  try {
    const ffmpegPath = require("ffmpeg-static") as string | null;
    const ffprobeModule = require("ffprobe-static") as { path?: string };
    const ffprobePath = ffprobeModule.path;
    if (!ffmpegPath || !ffprobePath || !existsSync(ffmpegPath) || !existsSync(ffprobePath)) return null;
    return { ffmpegPath, ffprobePath };
  } catch {
    return null;
  }
}
