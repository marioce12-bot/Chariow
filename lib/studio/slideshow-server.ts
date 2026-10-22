import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
const ffprobePath = require("ffprobe-static") as { path: string };
import { createAdminClient } from "@/lib/supabase/admin";
import { assembleSlideshow, prepareSlideshowVoice } from "@/lib/studio/slideshow";
import { slideshowAudioFilter, SLIDESHOW_AUDIO_CHANGE } from "@/lib/studio/slideshow-audio";
import { MAX_SLIDESHOW_IMAGES, MIN_SLIDESHOW_IMAGES, SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { storeStudioVideo, signedStudioUrl } from "@/lib/studio/media";
import { LICENSED_MUSIC, getLicensedTrack, musicAttribution, YOUTUBE_CREDIT_NOTICE } from "@/lib/studio/licensed-music";

import { assertSlideshowVoiceAllowed, buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
import { synthesizeCoveredSlideshowVoice } from "@/lib/studio/slideshow-voice-retry";

export const isRemixSlideshowDuration = (duration: unknown) => typeof duration === "number" && ([5, 10, ...SLIDESHOW_DURATIONS] as readonly number[]).includes(duration);

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
export const SLIDESHOW_PROMPT = "Preview slideshow assembled from existing images.";
export type SlideResult = { generationId: string; videoUrl: string; attribution: string; creditsCost: 0; imageGenerationIds: string[]; duration: number; musicId: string };
export const publicTracks = () => LICENSED_MUSIC.map(({ fileName: _fileName, localPath: _localPath, downloadUrl: _downloadUrl, ...track }) => track);
/** Authenticated slideshow is released on Preview and Production; character video stays locked. */
export function isPreviewEnabled() { return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production"; }
export function resolveTrackPath(trackId: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(trackId)) throw new Error("Invalid music id");
  return `_licensed-music/${trackId}.mp3`;
}
function binPaths() {
  if (!ffmpegPath || !ffprobePath.path) throw new Error("FFmpeg binaries unavailable");
  return { ffmpegPath, ffprobePath: ffprobePath.path };
}
async function downloadPrivate(pathname: string, directory: string, maxBytes: number) {
  if (!pathname || pathname.startsWith("/") || pathname.split("/").some(p => p === "..") || pathname.includes("\\")) throw new Error("Invalid private storage path");
  const { data, error } = await createAdminClient().storage.from("studio-media").download(pathname);
  if (error || !data) throw new Error("Private media unavailable");
  if (data.size > maxBytes) throw new Error("Media exceeds size limit");
  const target = path.join(directory, `${randomUUID()}${path.extname(pathname).toLowerCase() || ".bin"}`);
  await writeFile(target, Buffer.from(await data.arrayBuffer()));
  return target;
}
async function ensurePrivateTrack(track: NonNullable<ReturnType<typeof getLicensedTrack>>, directory: string) {
  const admin = createAdminClient();
  const bucket = await admin.storage.getBucket("studio-media");
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error("Private music storage required");
  const objectPath = resolveTrackPath(track.id);
  const existing = await admin.storage.from("studio-media").download(objectPath);
  if (existing.data && !existing.error) {
    if (existing.data.size > 25 * 1024 * 1024) throw new Error("Music track exceeds size limit");
    const local = path.join(directory, `${randomUUID()}.mp3`);
    await writeFile(local, Buffer.from(await existing.data.arrayBuffer()));
    return local;
  }
  const source = new URL(track.downloadUrl);
  if (source.protocol !== "https:" || source.hostname !== "www.scottbuckley.com.au" || source.username || source.password) throw new Error("Untrusted official music source");
  const response = await fetch(source, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000) });
  if (!response.ok || !response.body) throw new Error("Official music source unavailable");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 25 * 1024 * 1024) { await reader.cancel(); throw new Error("Music track exceeds size limit"); } chunks.push(value); }
  if (!total || !/^audio\//i.test(response.headers.get("content-type") || "")) throw new Error("Official source did not return audio");
  const audio = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const uploaded = await admin.storage.from("studio-media").upload(objectPath, audio, { contentType: "audio/mpeg", upsert: false });
  if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw new Error("Unable to cache private music");
  const local = path.join(directory, `${randomUUID()}.mp3`); await writeFile(local, audio); return local;
}
export async function uploadAndInsert(userId: string, generationId: string, body: Buffer, images: string[], duration: number, musicId: string, attribution: string, thumbnailStoragePath: string, taskId?: string, voiceover?: Record<string, unknown>) {
  const storagePath = await storeStudioVideo({ body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, contentType: "video/mp4" }, userId, generationId);
  const metadata = { type: "slideshow", imageGenerationIds: images, parentGenerationId: images[0], thumbnailStoragePath, ...(taskId ? { backgroundTaskId: taskId } : {}), musicId, duration, attribution, ...(voiceover ? { voiceover } : {}) };
  const { error } = await createAdminClient().from("studio_generations").insert({ id: generationId, user_id: userId, kind: "video", prompt: SLIDESHOW_PROMPT, options: { type: "slideshow", duration }, metadata, status: "completed", storage_path: storagePath, credits_cost: 0 });
  if (error) throw error;
  return { generationId, videoUrl: await signedStudioUrl(storagePath), attribution, creditsCost: 0 as const, imageGenerationIds: images, duration, musicId };
}
async function loadOwnedImages(userId: string, ids: string[], directory: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("studio_generations").select("id,user_id,kind,status,storage_path").in("id", ids).eq("user_id", userId);
  if (error) throw new Error("Unable to validate image generations");
  const byId = new Map((data ?? []).map((row: any) => [row.id, row]));
  if (ids.some(id => { const row: any = byId.get(id); return !row || row.user_id !== userId || row.kind !== "image" || row.status !== "completed" || typeof row.storage_path !== "string"; })) throw new Error("One or more images are unavailable");
  const files: string[] = [];
  for (const id of ids) {
    const storagePath = (byId.get(id) as any).storage_path as string;
    if (!/\.(png|jpe?g|webp)$/i.test(storagePath) || !storagePath.startsWith(`${userId}/`)) throw new Error("Image storage ownership mismatch");
    files.push(await downloadPrivate(storagePath, directory, MAX_SOURCE_BYTES));
  }
  return { files, thumbnailStoragePath: (byId.get(ids[0]) as any).storage_path as string };
}
export async function preflightSlideshow(musicId: string) {
  const bins = binPaths(); await stat(bins.ffmpegPath); await stat(bins.ffprobePath);
  const bucket = await createAdminClient().storage.getBucket("studio-media");
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error("Private Studio storage required");
  if (!musicId) return;
  const track = getLicensedTrack(musicId); if (!track) throw new Error("Music track unavailable");
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-preflight-"));
  try { await ensurePrivateTrack(track, work); } finally { await rm(work, { recursive: true, force: true }); }
}
export async function renderSlideshow(userId: string, ids: string[], duration: number, musicId: string, taskId?: string, voiceInput?: { product: { name: string; description?: string }; locale?: string; campaignGoal?: unknown }): Promise<SlideResult> {
  if (ids.length < MIN_SLIDESHOW_IMAGES || ids.length > MAX_SLIDESHOW_IMAGES || new Set(ids).size !== ids.length) throw new Error("Invalid slideshow image count");
  if (!(SLIDESHOW_DURATIONS as readonly number[]).includes(duration)) throw new Error("Invalid slideshow duration");
  // Only newly created, explicitly opted-in background tasks use TTS. Legacy tasks remain unchanged.
  let voicePlan: ReturnType<typeof buildSlideshowVoicePlan> | undefined;
  if (voiceInput) {
    if (!taskId) throw new Error("La voix nécessite une tâche persistante pour éviter les doublons.");
    assertSlideshowVoiceAllowed();
    voicePlan = buildSlideshowVoicePlan(voiceInput.product, duration, voiceInput.locale, voiceInput.campaignGoal);
    musicId = voicePlan.musicId;
  }
  const track = getLicensedTrack(musicId);
  if (musicId && !track) throw new Error("Music track unavailable");
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-slideshow-api-"));
  try {
    const { files: images, thumbnailStoragePath } = await loadOwnedImages(userId, ids, work);
    const music = track ? await ensurePrivateTrack(track, work) : undefined;
    let voicePath: string | undefined;
    let voiceMetadata: Record<string, unknown> | undefined;
    const bins = binPaths();
    if (voicePlan && voiceInput) {
      // The durable render claim prevents duplicate workers. Only measured timing
      // failures may request a revised script; uncertain/API failures stop at once.
      const covered = await synthesizeCoveredSlideshowVoice(voicePlan, voiceInput, async (audio, attempt) => {
        const raw = path.join(work, `narration-${attempt}.wav`);
        await writeFile(raw, audio);
        return prepareSlideshowVoice(raw, bins.ffmpegPath, bins.ffprobePath, duration, work);
      });
      voicePlan = covered.plan;
      voicePath = covered.voicePath;
      voiceMetadata = { ...voicePlan, provider: "gemini", tier: "free", creditsCost: 0, version: 2, attempts: covered.attempts };
    }
    const output = path.join(work, "slideshow.mp4");
    const attribution = track ? `${musicAttribution(track, { changes: ["synchronized with product visuals", "trimmed to slideshow duration", SLIDESHOW_AUDIO_CHANGE] })}\n${YOUTUBE_CREDIT_NOTICE}` : "Sans musique. Aucune attribution musicale nécessaire pour ce rendu.";
    const finalAttribution = voicePlan ? `${attribution}\nAdditional modifications: music ducked under generated product narration.` : attribution;
    await assembleSlideshow({ ...bins, outputPath: output, duration, imagePaths: images, musicPath: music, voicePath, width: 720, height: 1280, fps: 25, attribution: finalAttribution });
    const { size } = await stat(output);
    if (size > MAX_VIDEO_BYTES) throw new Error("Rendered video exceeds size limit");
    const generationId = taskId ? (() => {
      const hex = createHash("sha256").update(`slideshow-final:${taskId}`).digest("hex");
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    })() : randomUUID();
    return await uploadAndInsert(userId, generationId, await readFile(output), ids, duration, musicId, finalAttribution, thumbnailStoragePath, taskId, voiceMetadata);
  } finally { await rm(work, { recursive: true, force: true }); }
}
export async function remixSlideshow(userId: string, generationId: string, musicId: string): Promise<SlideResult> {
  const track = getLicensedTrack(musicId);
  if (musicId && !track) throw new Error("Music track unavailable");
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("studio_generations").select("id,user_id,kind,status,storage_path,metadata").eq("id", generationId).eq("user_id", userId).maybeSingle();
  if (error || !row || row.user_id !== userId || row.kind !== "video" || row.status !== "completed" || typeof row.storage_path !== "string" || !row.storage_path.startsWith(`${userId}/`) || row.metadata?.type !== "slideshow" || !Array.isArray(row.metadata.imageGenerationIds) || row.metadata.imageGenerationIds.length < 2 || row.metadata.imageGenerationIds.length > MAX_SLIDESHOW_IMAGES || new Set(row.metadata.imageGenerationIds).size !== row.metadata.imageGenerationIds.length || row.metadata.imageGenerationIds.some((id: unknown) => typeof id !== "string") || !isRemixSlideshowDuration(row.metadata.duration) || (row.metadata.musicId !== "" && !getLicensedTrack(row.metadata.musicId))) throw new Error("Slideshow unavailable");
  if (row.metadata.voiceover) throw new Error("La bande-son automatique de ce diaporama est conservée avec sa voix.");
  const images = row.metadata.imageGenerationIds as string[];
  // Verify the original still belongs to the user and is an image; never trust client paths/metadata alone.
  const { data: imageRows, error: imageError } = await admin.from("studio_generations").select("id,user_id,kind,status").in("id", images).eq("user_id", userId);
  if (imageError || images.some(id => !imageRows?.some((image: any) => image.id === id && image.user_id === userId && image.kind === "image" && image.status === "completed"))) throw new Error("Slideshow images unavailable");
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-slideshow-remix-"));
  try {
    const source = await downloadPrivate(row.storage_path, work, MAX_VIDEO_BYTES);
    const music = track ? await ensurePrivateTrack(track, work) : undefined;
    const output = path.join(work, "remix.mp4");
    const { ffmpegPath: ffmpeg } = binPaths();
    await new Promise<void>((resolve, reject) => {
      const { spawn } = require("node:child_process") as typeof import("node:child_process");
      const metadataCredit = track ? musicAttribution(track, { changes: ["synchronized with product visuals", "trimmed to slideshow duration", SLIDESHOW_AUDIO_CHANGE] }) : "Sans musique. Aucune attribution musicale nécessaire pour ce rendu.";
      const audioArgs = music ? ["-stream_loop", "-1", "-i", music, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", slideshowAudioFilter(row.metadata.duration), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"] : ["-map", "0:v:0", "-c:v", "copy", "-an"];
      const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", source, ...audioArgs, "-metadata", `comment=${metadataCredit}`, "-metadata", `description=${metadataCredit}`, "-t", String(row.metadata.duration), "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = ""; child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); }); child.on("error", reject); child.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg remix failed: ${stderr.slice(-2000)}`)));
    });
    const { size } = await stat(output);
    if (size > MAX_VIDEO_BYTES) throw new Error("Remix exceeds size limit");
    const attribution = track ? `${musicAttribution(track, { changes: ["synchronized with product visuals", "trimmed to slideshow duration", SLIDESHOW_AUDIO_CHANGE] })}\n${YOUTUBE_CREDIT_NOTICE}` : "Sans musique. Aucune attribution musicale nécessaire pour ce rendu.";
    const metadata = { ...row.metadata, musicId, attribution };
    const outputBuffer = await readFile(output);
    const newStoragePath = await storeStudioVideo({ body: outputBuffer.buffer.slice(outputBuffer.byteOffset, outputBuffer.byteOffset + outputBuffer.byteLength) as ArrayBuffer, contentType: "video/mp4" }, userId, `${generationId}-${randomUUID()}`);
    const { error: updateError } = await admin.from("studio_generations").update({ storage_path: newStoragePath, metadata, prompt: SLIDESHOW_PROMPT, credits_cost: 0 }).eq("id", generationId).eq("user_id", userId);
    if (updateError) throw updateError;
    return { generationId, videoUrl: await signedStudioUrl(newStoragePath), attribution, creditsCost: 0, imageGenerationIds: images, duration: row.metadata.duration, musicId };
  } finally { await rm(work, { recursive: true, force: true }); }
}
export async function makeMusicPreview(musicId: string): Promise<Buffer> {
  const track = getLicensedTrack(musicId);
  if (!track) throw new Error("Music track unavailable");
  const work = await mkdtemp(path.join(tmpdir(), "vendeo-music-preview-"));
  try {
    const logoSource = path.join(process.cwd(), "public", "vendeo-logo.webp");
    const logo = await writeFile(path.join(work, "logo.webp"), await readFile(logoSource)).then(() => path.join(work, "logo.webp"));
    const music = await ensurePrivateTrack(track, work);
    const output = path.join(work, "preview.mp4");
    const { ffmpegPath: ffmpeg } = binPaths();
    await new Promise<void>((resolve, reject) => {
      const { spawn } = require("node:child_process") as typeof import("node:child_process");
      const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", logo, "-stream_loop", "-1", "-i", music, "-t", "10", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-b:a", "128k", "-af", slideshowAudioFilter(10), "-metadata", `comment=${musicAttribution(track, { changes: ["synchronized to Vendeo preview", "trimmed to 10s", SLIDESHOW_AUDIO_CHANGE] })}`, "-shortest", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = ""; child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); }); child.on("error", reject); child.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg preview failed: ${stderr.slice(-2000)}`)));
    });
    return await readFile(output);
  } finally { await rm(work, { recursive: true, force: true }); }
}
