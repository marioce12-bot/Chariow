import { existsSync } from "node:fs";
import ffprobeStatic from "ffprobe-static";

/** Video ads use ffprobe for validation; ffmpeg stays in the fallback/slideshow worker only. */
export function packagedVideoProbe(): string | null {
  try {
    const probePath = ffprobeStatic.path;
    return probePath && existsSync(probePath) ? probePath : null;
  } catch {
    return null;
  }
}
