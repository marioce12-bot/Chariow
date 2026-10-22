import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStudioImage } from "@/lib/studio/image-generation";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";
import {
  preflightSlideshow,
  renderSlideshow,
} from "@/lib/studio/slideshow-server";
import { assertSlideshowVoiceAllowed } from "@/lib/studio/slideshow-voice";
import { signedStudioUrl } from "@/lib/studio/media";

export const TASK_TYPE = "studio_background_task";
export type StageRecord = {
  step: number;
  kind: "preflight" | "image" | "render";
  state: "running" | "completed" | "uncertain";
  generationId?: string;
  cost: number;
  creditState: "none" | "confirmed" | "uncertain";
  startedAt: string;
  completedAt?: string;
};
// Refusals returned BEFORE any credit reservation or provider call: nothing was charged,
// so the step is safe to retry after the user tops up / renews.
export const NO_CHARGE_ERROR_CODES = ["STUDIO_INSUFFICIENT_CREDITS", "STUDIO_PLANS_REQUIRED"];
export class StudioTaskError extends Error {
  constructor(public code: string, public status: number | null = null, message?: string) {
    super(message ?? "Le suivi serveur n’a pas pu continuer. Les étapes terminées sont conservées ; aucune étape payante n’est relancée.");
  }
}
// Maps a non-OK image response to a task error. A 402 keeps its real, user-readable message.
function stepHttpError(status: number | null, body: any, fallbackCode: string) {
  const message = typeof body?.error === "string" ? body.error : undefined;
  if (status === 402 && body?.code === "INSUFFICIENT_CREDITS") return new StudioTaskError("STUDIO_INSUFFICIENT_CREDITS", 402, message);
  if (status === 402 && body?.code === "PLANS_REQUIRED") return new StudioTaskError("STUDIO_PLANS_REQUIRED", 402, message);
  return new StudioTaskError(fallbackCode, status);
}
export function stageGenerationId(id: string, revision: number) {
  const hex = createHash("sha256").update(`studio-stage:${id}:${revision}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
// Strict allow-list: never log provider messages, inputs, URLs, tokens or user data.
export function logTaskEvent(event: string, id: string, step: number, meta?: Partial<TaskMetadata>, error?: unknown) {
  const failure = error instanceof StudioTaskError ? error : undefined;
  console.info(JSON.stringify({ event, taskId: id, step, httpStatus: failure?.status ?? null,
    errorCode: failure?.code ?? (error ? "STUDIO_STEP_FAILED" : null),
    completedImages: meta?.images?.length ?? 0,
    creditsConsumed: meta?.creditsConsumed ?? (meta?.images?.length ?? 0) * 20,
    creditState: meta?.creditState ?? "uncertain" }));
}
export type TaskMetadata = {
  type: typeof TASK_TYPE;
  taskKind: "image" | "slideshow";
  input: any;
  revision: number;
  continueQueued?: boolean;
  phase: "queued" | "running" | "completed" | "failed";
  message: string;
  progress: number;
  updatedAt: string;
  images: Array<{ id: string; url: string }>;
  stages?: StageRecord[];
  creditsConsumed?: number;
  creditState?: "confirmed" | "uncertain";
  errorCode?: string;
  httpStatus?: number | null;
  result?: any;
  error?: string;
};
export function taskToken(id: string, revision: number) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Configuration serveur indisponible.");
  return createHmac("sha256", secret)
    .update(`studio-task:${id}:${revision}`)
    .digest("hex");
}
export function validTaskToken(id: string, revision: number, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(
    Buffer.from(taskToken(id, revision)),
    Buffer.from(token),
  );
}
export async function publicTask(row: any) {
  const metadata = row.metadata as TaskMetadata;
  let result = metadata.result;
  let recoveredFinal = false;
  if (!result && metadata.taskKind === "slideshow" && metadata.input?.voiceover === true && (metadata.stages ?? []).some(stage => stage.kind === "render")) {
    const { data } = await createAdminClient().from("studio_generations")
      .select("id,storage_path,metadata").eq("user_id", row.user_id)
      .eq("metadata->>backgroundTaskId", row.id).eq("metadata->>type", "slideshow")
      .eq("status", "completed").limit(1);
    const saved = data?.[0];
    if (saved?.storage_path && saved.metadata?.voiceover) {
      result = { generationId: saved.id, videoUrl: await signedStudioUrl(saved.storage_path),
        duration: saved.metadata.duration, musicId: saved.metadata.musicId, attribution: saved.metadata.attribution,
        imageGenerationIds: saved.metadata.imageGenerationIds, creditsCost: 0 };
      recoveredFinal = true;
    }
  }
  let images = [...(metadata.images ?? [])];
  let sourceImagesConfirmed = images.length === 0;
  // Read-only reconciliation: recover a stored child after a lost response or parent write.
  // Never dispatch work, reserve credits, or call a provider while reading task status.
  const recoverableIds = (metadata.stages ?? []).filter(stage => stage.kind === "image" && stage.generationId).map(stage => stage.generationId!);
  if (images.length || recoverableIds.length) {
    const { data } = await createAdminClient()
      .from("studio_generations")
      .select("id,storage_path,status,credits_cost")
      .in(
        "id",
        [...new Set([...images.map((image) => image.id), ...recoverableIds])],
      )
      .eq("user_id", row.user_id)
      .limit(5);
    sourceImagesConfirmed = images.every(image => data?.some((saved: any) => saved.id === image.id && saved.status === "completed" && saved.storage_path));
    for (const generationId of recoverableIds) {
      const saved = data?.find((item: any) => item.id === generationId && item.status === "completed" && item.storage_path);
      if (saved && !images.some(image => image.id === generationId)) images.push({ id: generationId, url: await signedStudioUrl(saved.storage_path) });
    }
    images = await Promise.all(
      images.map(async (image) => {
        const saved = data?.find((item: any) => item.id === image.id);
        return saved?.storage_path
          ? { ...image, url: await signedStudioUrl(saved.storage_path) }
          : image;
      }),
    );
  }
  if (result?.generationId) {
    const { data } = await createAdminClient()
      .from("studio_generations")
      .select("storage_path,metadata")
      .eq("id", result.generationId)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (data?.storage_path) {
      const url = await signedStudioUrl(data.storage_path);
      result = {
        ...result,
        ...(metadata.taskKind === "image"
          ? { imageUrl: url }
          : { videoUrl: url, ...(data.metadata?.type === "slideshow" ? { musicId: data.metadata.musicId, attribution: data.metadata.attribution, duration: data.metadata.duration } : {}) }),
      };
    } else if (!data) result = null; // A deliberately deleted creation must not reappear.
  }
  // Provider work is never repeated after an uncertain timeout.
  const stale =
    row.status === "processing" &&
    Date.now() - Date.parse(metadata.updatedAt) > 7 * 60_000;
  const input = metadata.taskKind === "slideshow" ? {
    product: metadata.input?.product ? {
      name: metadata.input.product.name,
      description: metadata.input.product.description,
      image: metadata.input.product.image,
    } : undefined,
    duration: metadata.input?.duration,
    musicId: metadata.input?.musicId,
    campaignGoal: metadata.input?.campaignGoal,
    locale: metadata.input?.locale,
    variationId: metadata.input?.variationId,
    voiceover: metadata.input?.voiceover === true,
  } : undefined;
  return {
    id: row.id,
    kind: metadata.taskKind,
    status: recoveredFinal ? "completed" : stale ? "failed" : row.status,
    phase: recoveredFinal ? "completed" : stale ? "failed" : metadata.phase,
    revision: metadata.revision,
    updatedAt: metadata.updatedAt,
    creditsConsumed: Math.max(metadata.creditsConsumed ?? 0, images.length * 20),
    creditState: stale && metadata.phase === "running" ? "uncertain" : (metadata.creditState ?? "confirmed"),
    errorCode: stale ? "STUDIO_TASK_STALE" : metadata.errorCode,
    progress: (recoveredFinal || row.status === "completed") && result ? 100 : Math.min(99, metadata.progress),
    message: recoveredFinal ? "Création prête." : metadata.message,
    error: recoveredFinal ? undefined : stale
      ? "Le suivi de cette génération a été interrompu. Consulte l’historique : aucune nouvelle génération n’a été lancée automatiquement."
      : metadata.error,
    images,
    sourceImagesConfirmed,
    ...(input ? { input } : {}),
    result,
    createdAt: row.created_at,
  };
}

// Historical dispatch errors were persisted ONLY by failTask(expected phase=queued).
// The compare-and-set against queued proves no worker had claimed that revision:
// a claimed worker switches to running before any paid call and prevents this failure write.
// Require the exact server-only signature, checkpoint revision, and verified stored children.
export function legacyQueuedDispatchCheckpoint(row: any, task: any) {
  const meta = row.metadata;
  return !meta.stages && row.status === "failed" && meta.phase === "failed" &&
    meta.error === "Le suivi serveur n’a pas pu continuer. Aucune étape payante n’est relancée." &&
    meta.revision === task.images.length + 1 && task.images.length > 0 && task.images.length <= 5 &&
    task.sourceImagesConfirmed === true;
}
export function continuationQuote(row: any, task: any) {
  const meta = row.metadata as TaskMetadata;
  const stale = task.status === "failed" && task.errorCode === "STUDIO_TASK_STALE";
  const stages = meta.stages ?? [];
  const knownCompletedImages = new Set((task.images ?? []).map((image: any) => image.id));
  const uncertain = stages.some((stage) => stage.state !== "completed" &&
    !(stage.kind === "image" && stage.generationId && knownCompletedImages.has(stage.generationId)));
  const stageProofMissing = !meta.stages && meta.revision > 0 && meta.continueQueued !== true && !legacyQueuedDispatchCheckpoint(row, task);
  const failedOrStale = row.status === "failed" || stale;
  let reason: string | null = null;
  if (meta.taskKind !== "slideshow") reason = "UNSUPPORTED_TASK";
  else if (!failedOrStale) reason = "TASK_NOT_FAILED";
  else if (task.sourceImagesConfirmed === false) reason = "COMPLETED_ASSET_MISSING";
  else if (uncertain) reason = "STAGE_UNCERTAIN";
  else if (stageProofMissing) reason = "STAGE_HISTORY_UNKNOWN";
  else if (task.images.length > 5) reason = "INVALID_IMAGE_STATE";
  const nextStep = task.images.length < 5 ? "image" : "render";
  return { allowed: !reason, reason, cost: nextStep === "image" ? (5 - task.images.length) * 20 : 0, nextStep, requiresConfirmation: nextStep === "image" };
}
export async function failTask(
  id: string,
  error: unknown,
  expected?: { revision: number; phase: string },
) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("studio_generations")
    .select("metadata,status")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.status !== "processing") return;
  if (
    expected &&
    (row.metadata?.revision !== expected.revision ||
      row.metadata?.phase !== expected.phase)
  )
    return;
  const message =
    error instanceof Error ? error.message : "Génération interrompue.";
  const code = error instanceof StudioTaskError ? error.code : "STUDIO_STEP_FAILED";
  // A refusal returned before any reservation (insufficient credits, subscription) charged nothing:
  // the running step is dropped instead of being marked uncertain, so it can be resumed after a top-up.
  const noCharge = error instanceof StudioTaskError && NO_CHARGE_ERROR_CODES.includes(error.code);
  const uncertain = row.metadata.phase === "running" && !noCharge;
  logTaskEvent("task_failed", id, row.metadata.revision, { ...row.metadata, creditState: uncertain ? "uncertain" : row.metadata.creditState }, error);
  const failure = await admin
    .from("studio_generations")
    .update({
      status: "failed",
      error: message,
      metadata: {
        ...row.metadata,
        phase: "failed",
        error: message,
        errorCode: code,
        httpStatus: error instanceof StudioTaskError ? error.status : null,
        creditState: uncertain ? "uncertain" : (noCharge ? "confirmed" : (row.metadata.creditState ?? "confirmed")),
        stages: (row.metadata.stages ?? [])
          .filter((stage: StageRecord) => !(noCharge && stage.state === "running"))
          .map((stage: StageRecord) => stage.state === "running" ? { ...stage, state: "uncertain", creditState: stage.kind === "image" ? "uncertain" : stage.creditState } : stage),
        message,
        updatedAt: new Date().toISOString(),
      },
    })
    .eq("id", id)
    .eq("status", "processing")
    .eq("metadata->>revision", String(row.metadata.revision))
    .eq("metadata->>phase", row.metadata.phase);
  if (failure.error) logTaskEvent("failure_persistence_failed", id, row.metadata.revision, row.metadata, new StudioTaskError("STUDIO_PERSISTENCE_FAILED"));
}
export async function runTaskStep(id: string, revision: number) {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("studio_generations")
    .select("id,user_id,status,metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (
    !row ||
    row.status !== "processing" ||
    row.metadata?.type !== TASK_TYPE ||
    row.metadata.phase !== "queued" ||
    row.metadata.revision !== revision
  )
    return;
  const meta = row.metadata as TaskMetadata;
  const stage: StageRecord = {
    step: revision, kind: meta.taskKind === "image" || (revision > 0 && meta.images.length < 5) ? "image" : revision === 0 ? "preflight" : "render",
    state: "running", cost: 0, creditState: "none", startedAt: new Date().toISOString(),
  };
  if (stage.kind === "image") {
    stage.generationId = stageGenerationId(id, revision);
    stage.cost = meta.taskKind === "slideshow" ? 20 : 0;
    stage.creditState = "uncertain";
  }
  // A durable per-step claim is written BEFORE any paid work; never reclaim running/uncertain steps.
  const claimed: TaskMetadata = {
    ...meta,
    phase: "running",
    stages: [...(meta.stages ?? []), stage],
    creditState: stage.kind === "image" ? "uncertain" : (meta.creditState ?? "confirmed"),
    updatedAt: new Date().toISOString(),
  };
  const claim = await admin
    .from("studio_generations")
    .update({ metadata: claimed })
    .eq("id", id)
    .eq("status", "processing")
    .eq("metadata->>phase", "queued")
    .eq("metadata->>revision", String(revision))
    .select("id");
  if (claim.error) throw claim.error;
  if (!claim.data?.length) return; // A duplicate worker must not reserve credits or call a provider.
  logTaskEvent("stage_started", id, revision, claimed);
  try {
    let result: any;
    let images = meta.images;
    if (meta.taskKind === "image") {
      const response = await generateStudioImage(row.user_id, meta.input, { generationId: stage.generationId!, taskId: id, step: revision });
      result = await response.json();
      if (!response.ok)
        throw stepHttpError(response.status ?? null, result, "STUDIO_IMAGE_HTTP");
    } else if (revision === 0) {
      // Reject insufficient/repeated copy and scenes before any external preflight or image.
      const { product, duration, campaignGoal, locale } = meta.input;
      if (meta.input.voiceover === true) assertSlideshowVoiceAllowed();
      buildSlideshowPlan({
        name: product.name,
        description: typeof product.description === "string" ? product.description : "",
        hasReference: Boolean(product.image), duration, aspectRatio: "9:16",
        character: "with", locale, campaignGoal, variationId: meta.input.variationId,
      });
      await preflightSlideshow(meta.input.musicId);
    } else if (images.length < 5) {
      const { product, duration, campaignGoal, locale } = meta.input;
      const plan = buildSlideshowPlan({
        name: product.name,
        description: product.description || "",
        hasReference: Boolean(product.image),
        duration,
        aspectRatio: "9:16",
        character: "auto",
        userBrief: "",
        previousPrompt: "",
        locale,
        campaignGoal, variationId: meta.input.variationId,
      });
      const slide = plan.slides[images.length];
      const response = await generateStudioImage(row.user_id, {
        prompt: slide.prompt,
        quality: "medium",
        resolution: "hd",
        orientation: "portrait",
        background: "opaque",
        referenceUrls: product.image ? [product.image] : [],
        slideshow: {
          product,
          duration,
          aspectRatio: "9:16",
          locale,
          campaignGoal,
          variationId: meta.input.variationId,
          imageCount: 5,
          slideIndex: slide.index,
        },
      }, { generationId: stage.generationId!, taskId: id, step: revision });
      const image = await response.json();
      if (!response.ok || !image.generationId || !image.imageUrl)
        throw stepHttpError(response.status ?? null, image, image.code === "STUDIO_STAGE_UNCERTAIN" ? "STUDIO_STAGE_UNCERTAIN" : "STUDIO_IMAGE_HTTP");
      images = [...images, { id: image.generationId, url: image.imageUrl }];
    } else {
      const ids = images.map((image) => image.id);
      result = meta.input.voiceover === true
        ? await renderSlideshow(row.user_id, ids, meta.input.duration, meta.input.musicId, id, { product: meta.input.product, locale: meta.input.locale, campaignGoal: meta.input.campaignGoal })
        : await renderSlideshow(row.user_id, ids, meta.input.duration, meta.input.musicId, id);
    }
    if (meta.taskKind === "slideshow" && result && (!result.videoUrl || !result.generationId))
      throw new StudioTaskError("STUDIO_MP4_NOT_READY");
    const complete = Boolean(result);
    const next: TaskMetadata = {
      ...meta,
      images,
      stages: [...(meta.stages ?? []), { ...stage, state: "completed", creditState: stage.kind === "image" ? "confirmed" : "none", completedAt: new Date().toISOString() }],
      creditsConsumed: (meta.creditsConsumed ?? meta.images.length * 20) + (stage.kind === "image" ? (meta.taskKind === "image" ? Number(result?.cost ?? 0) : 20) : 0),
      creditState: "confirmed",
      revision: revision + 1,
      phase: complete ? "completed" : "queued",
      progress: complete ? 100 : Math.min(95, 5 + images.length * 17),
      message: complete
        ? "Création prête."
        : images.length === 5
          ? (meta.input.voiceover === true ? "Voix et mixage du diaporama…" : "Montage du diaporama…")
          : `Génération du visuel ${images.length + 1}/5…`,
      updatedAt: new Date().toISOString(),
      ...(result ? { result } : {}),
    };
    const saved = await admin
      .from("studio_generations")
      .update({ status: complete ? "completed" : "processing", metadata: next })
      .eq("id", id)
      .eq("metadata->>phase", "running")
      .eq("metadata->>revision", String(revision))
      .select("id");
    if (!saved.data?.length && !saved.error) return;
    if (saved.error) throw new StudioTaskError("STUDIO_PERSISTENCE_FAILED");
    logTaskEvent("stage_completed", id, revision, next);
    // The durable orchestrator schedules the next independent invocation.
    // Never fetch this worker from a worker (Vercel rejects recursive chains).
    return complete ? null : next.revision;
  } catch (error) {
    await failTask(id, error, { revision, phase: "running" });
  }
}
