import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functions = [
  {
    name: "POST /api/studio/video",
    manifest: ".next/server/app/api/studio/video/route.js.nft.json",
    required: [
      { name: "ffmpeg-static package link", matches: file => /^(?:\.\.\/)+node_modules\/ffmpeg-static$/.test(file), directory: true },
      { name: "ffmpeg-static entry", matches: file => /(?:^|\/)ffmpeg-static\/index\.js$/.test(file) },
      { name: "ffmpeg-static package metadata", matches: file => /(?:^|\/)ffmpeg-static\/package\.json$/.test(file) },
      { name: "ffprobe-static entry", matches: file => /(?:^|\/)ffprobe-static\/index\.js$/.test(file) },
      { name: "ffprobe-static package metadata", matches: file => /(?:^|\/)ffprobe-static\/package\.json$/.test(file) },
      { name: "ffprobe executable (linux/x64)", matches: file => /(?:^|\/)ffprobe-static\/bin\/linux\/x64\/ffprobe$/.test(file), executable: true },
    ],
    forbidden: file => /(?:^|\/)ffmpeg-static\/ffmpeg$/.test(file),
  },
  {
    name: "workflow step handler",
    manifest: ".next/server/app/.well-known/workflow/v1/step/route.js.nft.json",
    required: [
      { name: "ffmpeg-static entry", matches: file => /(?:^|\/)ffmpeg-static\/index\.js$/.test(file) },
      { name: "ffmpeg-static package metadata", matches: file => /(?:^|\/)ffmpeg-static\/package\.json$/.test(file) },
      { name: "ffmpeg executable", matches: file => /(?:^|\/)ffmpeg-static\/ffmpeg$/.test(file), executable: true },
      { name: "ffprobe-static entry", matches: file => /(?:^|\/)ffprobe-static\/index\.js$/.test(file) },
      { name: "ffprobe-static package metadata", matches: file => /(?:^|\/)ffprobe-static\/package\.json$/.test(file) },
      { name: "ffprobe executable (linux/x64)", matches: file => /(?:^|\/)ffprobe-static\/bin\/linux\/x64\/ffprobe$/.test(file), executable: true },
    ],
  },
];

let failures = 0;
for (const fn of functions) {
  const manifestPath = path.join(projectRoot, fn.manifest);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    console.error(`FAIL ${fn.name}: ${fn.manifest} is missing; run npm run build first.`);
    failures++;
    continue;
  }

  const files = manifest.files.map(file => file.replaceAll("\\", "/"));
  if (fn.forbidden && files.some(fn.forbidden)) {
    console.error(`FAIL ${fn.name}: FFmpeg executable should not be included in this route bundle.`);
    failures++;
  }
  for (const requirement of fn.required) {
    const match = files.find(requirement.matches);
    if (!match) {
      console.error(`FAIL ${fn.name}: trace does not include ${requirement.name}.`);
      failures++;
      continue;
    }
    const absolutePath = path.resolve(path.dirname(manifestPath), match);
    try {
      const fileInfo = await stat(absolutePath);
      if (requirement.directory ? !fileInfo.isDirectory() : (!fileInfo.isFile() || fileInfo.size === 0)) throw new Error("not a non-empty file or package directory");
      if (requirement.executable) await access(absolutePath, constants.X_OK);
      const sizeLabel = requirement.directory ? "package link" : `${Math.round(fileInfo.size / 1024 / 1024)} MiB`;
      console.log(`OK   ${fn.name}: ${requirement.name} (${sizeLabel})`);
    } catch {
      console.error(`FAIL ${fn.name}: traced ${requirement.name}, but ${match} is missing or unusable in the build tree.`);
      failures++;
    }
  }
}

if (failures) process.exitCode = 1;
else console.log("Video route bundles ffmpeg-static's loader and ffprobe, without the FFmpeg executable; the durable worker keeps FFmpeg/FFprobe for fallback and slideshow.");
