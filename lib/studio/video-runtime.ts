import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export type VideoBinaries = { ffmpegPath: string; ffprobePath: string };

function firstExisting(candidates: Array<string | null | undefined>) {
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && existsSync(candidate)) ?? null;
}

function pnpmPackageBinary(packageName: string, relativeBinary: string) {
  const pnpmRoot = path.join(process.cwd(), "node_modules", ".pnpm");
  try {
    const entry = readdirSync(pnpmRoot).find((name) => name.startsWith(`${packageName}@`));
    return entry ? path.join(pnpmRoot, entry, "node_modules", packageName, relativeBinary) : null;
  } catch {
    return null;
  }
}

/** Resolve package-provided binaries only: Vercel does not guarantee system ffmpeg. */
export function packagedVideoBinaries(): VideoBinaries | null {
  try {
    const resolvedFfmpeg = firstExisting([
      ffmpegPath,
      path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
      pnpmPackageBinary("ffmpeg-static", "ffmpeg"),
    ]);
    const resolvedFfprobe = firstExisting([
      ffprobeStatic.path,
      path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "linux", "x64", "ffprobe"),
      pnpmPackageBinary("ffprobe-static", path.join("bin", "linux", "x64", "ffprobe")),
    ]);
    if (!resolvedFfmpeg || !resolvedFfprobe) return null;
    return { ffmpegPath: resolvedFfmpeg, ffprobePath: resolvedFfprobe };
  } catch {
    return null;
  }
}
