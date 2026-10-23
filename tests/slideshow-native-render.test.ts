import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { assembleSlideshow } from "../lib/studio/slideshow";
const exec = promisify(execFile);

it("renders native motion end-to-end with a genuinely advancing accent and a held CTA", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vendeo-native-test-"));
  try {
    const images = [];
    for (let i = 0; i < 5; i++) {
      const image = path.join(dir, `${i}.png`);
      await exec("/usr/bin/ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=160x90:d=0.1", "-frames:v", "1", image]);
      images.push(image);
    }
    const output = path.join(dir, "native.mp4");
    const result = await assembleSlideshow({ ffmpegPath: "/usr/bin/ffmpeg", ffprobePath: "/usr/bin/ffprobe", outputPath: output, imagePaths: images, duration: 25, width: 160, height: 90, fps: 25, motionDesign: true, profileSeed: "fixture" });
    expect(result.duration).toBeCloseTo(25, 1);
    const pixel = async (second: number) => {
      const { stdout } = await exec("/usr/bin/ffmpeg", ["-v", "error", "-ss", String(second), "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { encoding: "buffer" });
      const offset = (82 * 160 + 80) * 3;
      return Array.from(stdout.subarray(offset, offset + 3));
    };
    const early = await pixel(2), late = await pixel(23);
    // At halfway across the frame, the accent must arrive only later.
    expect(early[1]).toBeLessThan(150);
    expect(late[1]).toBeGreaterThan(170);
    expect(late[1] - late[0]).toBeGreaterThan(50);
    // CTA center is unchanged after its entrance, while the edge still advances.
    const center = async (second: number) => {
      const { stdout } = await exec("/usr/bin/ffmpeg", ["-v", "error", "-ss", String(second), "-i", output, "-frames:v", "1", "-vf", "crop=120:60:20:10", "-f", "md5", "pipe:1"]);
      return stdout.trim();
    };
    expect(await center(23)).toEqual(await center(24));
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 120_000);
