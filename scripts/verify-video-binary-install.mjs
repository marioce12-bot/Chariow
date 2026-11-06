import { existsSync, statSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const binaries = [
  ["ffmpeg-static", ffmpegPath],
  ["ffprobe-static linux/x64", path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "linux", "x64", "ffprobe")],
];
const missing = binaries.filter(([, file]) => !file || !existsSync(file) || !statSync(file).isFile());
if (missing.length) {
  console.error(`Video engine install incomplete: ${missing.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Video engine binaries installed: ffmpeg=${ffmpegPath}, ffprobe=${binaries[1][1]}`);
