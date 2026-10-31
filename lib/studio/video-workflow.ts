import { FatalError, sleep } from "workflow";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFalVideo, downloadFalVideo, downloadFalQueueUtilityFile, FAL_EXTRACT_FRAME_ENDPOINT, FAL_MERGE_VIDEOS_ENDPOINT, getFalVideoJob, submitFalQueueUtility } from "@/lib/ai/fal";
import { assembleVideo, extractLastFrame } from "@/lib/studio/video-assembly";
import { probeVideoFile, validateFinalPortraitVideo } from "@/lib/studio/video-probe";
import { packagedVideoBinaries } from "@/lib/studio/video-runtime";
import { signedStudioUrl, storeStudioVideo } from "@/lib/studio/media";
import { deleteStudioVideoArtifacts, readStudioVideoArtifact, storeStudioVideoArtifact } from "@/lib/studio/video-artifacts";
import type { VideoAdPlan } from "@/lib/studio/video-plan";
import { isFalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";

const MAX_POLLS_PER_SEGMENT = 60;
const POLL_DELAY = "10s";

type VideoRow = {
  id: string;
  user_id: string;
  status: string;
  storage_path: string | null;
  credit_transaction_id: string | null;
  metadata: Record<string, any>;
};

async function readVideoRow(id: string): Promise<VideoRow | null> {
  const { data, error } = await createAdminClient()
    .from("studio_generations")
    .select("id,user_id,status,storage_path,credit_transaction_id,metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Le suivi vidéo est indisponible.");
  return (data as VideoRow | null) ?? null;
}

async function setDailyQuotaState(row: VideoRow, state: "submitted" | "uncertain" | "completed" | "failed_spent" | "released") {
  const result = await createAdminClient().rpc("set_studio_video_quota_state", {
    p_user_id: row.user_id,
    p_generation_id: row.id,
    p_state: state,
  });
  if (result.error || (result.data as { ok?: boolean } | null)?.ok === false) {
    throw new Error("Impossible de confirmer le quota quotidien vidéo.");
  }
}

async function patchVideoRow(
  id: string,
  patch: Record<string, unknown>,
  rowPatch: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const row = await readVideoRow(id);
  if (!row) throw new Error("Tâche vidéo introuvable.");
  const metadata = { ...(row.metadata ?? {}), ...patch, updatedAt: new Date().toISOString() };
  const { data, error } = await createAdminClient()
    .from("studio_generations")
    .update({ ...rowPatch, metadata })
    .eq("id", id)
    .eq("user_id", row.user_id)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Impossible d’enregistrer la progression vidéo.");
  return metadata as Record<string, any>;
}

export async function claimVideoWorkflowStep(id: string) {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.status !== "processing") return false;
  if (row.metadata?.phase === "queued") {
    const next = { ...(row.metadata ?? {}), phase: "running", progress: 2, updatedAt: new Date().toISOString() };
    const { data, error } = await createAdminClient()
      .from("studio_generations")
      .update({ metadata: next })
      .eq("id", id)
      .eq("user_id", row.user_id)
      .eq("status", "processing")
      .eq("metadata->>phase", "queued")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Impossible de démarrer le suivi vidéo.");
    return Boolean(data);
  }
  // Only the first dispatch may claim the queued row. Replays in that same
  // durable workflow use the stored step result; an independent duplicate exits.
  return false;
}

export async function failQueuedVideoDispatchStep(id: string) {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.metadata?.creditState === "refunded") return;
  const needsClaim = row.status === "processing" && row.metadata?.phase === "queued";
  if (!needsClaim && (row.status !== "failed" || row.metadata?.phase !== "dispatch_failed")) return;
  const failedMetadata = {
    ...(row.metadata ?? {}),
    phase: "dispatch_failed",
    errorCode: "STUDIO_VIDEO_DISPATCH_FAILED",
    userMessage: "Le workflow vidéo n’a pas démarré; la réservation de crédits est en cours de vérification. Aucun rendu n’a été lancé.",
    updatedAt: new Date().toISOString(),
  };
  if (needsClaim) {
    const claimed = await createAdminClient()
      .from("studio_generations")
      .update({ status: "failed", error: failedMetadata.userMessage, metadata: failedMetadata })
      .eq("id", id)
      .eq("user_id", row.user_id)
      .eq("status", "processing")
      .eq("metadata->>phase", "queued")
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error("Impossible de vérifier l’échec du workflow vidéo.");
    if (!claimed.data) return;
  }

  let creditState: "uncertain" | "refunded" | "consumed" = "uncertain";
  if (row.credit_transaction_id) {
    const check = await createAdminClient().from("credit_transactions").select("status").eq("id", row.credit_transaction_id).maybeSingle();
    if (!check.error && check.data?.status === "refunded") creditState = "refunded";
    else if (!check.error && check.data?.status === "completed") creditState = "consumed";
    else if (!check.error && check.data?.status === "pending") {
      const refund = await createAdminClient().rpc("refund_credit_debit", { transaction_id: row.credit_transaction_id });
      if (!refund.error && refund.data === true) creditState = "refunded";
      else {
        const finalCheck = await createAdminClient().from("credit_transactions").select("status").eq("id", row.credit_transaction_id).maybeSingle();
        if (!finalCheck.error && finalCheck.data?.status === "refunded") creditState = "refunded";
        else if (!finalCheck.error && finalCheck.data?.status === "completed") creditState = "consumed";
      }
    }
  }
  const userMessage = creditState === "refunded"
    ? "Le workflow vidéo n’a pas démarré. Les crédits Studio ont été libérés; aucun rendu n’a été lancé."
    : "Le workflow vidéo n’a pas démarré, mais l’état de la réservation de crédits est incertain. Ne relance pas la vidéo.";
  await patchVideoRow(id, { creditState, userMessage, updatedAt: new Date().toISOString() }, { error: userMessage });
  await setDailyQuotaState(row, creditState === "refunded" ? "released" : "uncertain");
}

export async function submitVideoSegmentStep(id: string, index: 0 | 1): Promise<string | null> {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.status !== "processing") return null;
  const metadata = row.metadata ?? {};
  const stateKey = `segment${index}State`;
  const jobKey = `segment${index}JobId`;
  const state = metadata[stateKey];
  if (["submitting", "submitted", "completed", "uncertain"].includes(state) && typeof metadata[jobKey] === "string") {
    await setDailyQuotaState(row, "submitted");
    return metadata[jobKey];
  }
  if (state !== "pending") return null;
  const plan = metadata.plan as VideoAdPlan | undefined;
  const segment = plan?.segments?.[index];
  const resolution = metadata.resolution;
  const aspectRatio = metadata.aspectRatio;
  const referenceUrl = index === 0
    ? metadata.initialReferenceUrl
    : typeof metadata.continuityFramePath === "string" ? await signedStudioUrl(metadata.continuityFramePath) : null;
  if (!segment || !["480p", "720p"].includes(resolution) || aspectRatio !== "9:16") {
    throw new FatalError("STUDIO_VIDEO_PLAN_INVALID");
  }
  if (index === 1 && typeof referenceUrl !== "string") throw new FatalError("STUDIO_VIDEO_CONTINUITY_MISSING");

  const submitting = {
    ...metadata,
    [stateKey]: "submitting",
    [`segment${index}ClaimedAt`]: new Date().toISOString(),
    phase: `segment${index}_submitting`,
    progress: index === 0 ? 5 : 52,
    updatedAt: new Date().toISOString(),
  };
  // This is a database-side compare-and-set on the JSONB state. Only the call
  // that changes pending -> submitting is allowed to contact Fal. A replay that
  // sees submitting without a saved job id fails closed and never submits twice.
  const claim = await createAdminClient()
    .from("studio_generations")
    .update({ metadata: submitting })
    .eq("id", id)
    .eq("user_id", row.user_id)
    .eq(`metadata->>${stateKey}`, "pending")
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (claim.error) throw new FatalError("STUDIO_VIDEO_CLAIM_FAILED");
  if (!claim.data) return null;

  let submittedJobId: string | null = null;
  try {
    submittedJobId = await createFalVideo(segment.prompt, {
      duration: segment.duration as 10 | 15,
      resolution,
      aspectRatio,
      referenceUrl: typeof referenceUrl === "string" ? referenceUrl : undefined,
    });
    const saved: Record<string, any> = await patchVideoRow(id, {
      [stateKey]: "submitted",
      [jobKey]: submittedJobId,
      phase: `segment${index}_processing`,
      progress: index === 0 ? 10 : 58,
      creditState: "reserved",
    });
    if (saved[stateKey] !== "submitted" || saved[jobKey] !== submittedJobId) throw new Error("Le job vidéo n’a pas pu être confirmé.");
    await setDailyQuotaState(row, "submitted");
    return submittedJobId;
  } catch (error) {
    if (isFalVideoInputRejectedError(error)) {
      await patchVideoRow(id, {
        [stateKey]: "rejected",
        phase: "provider_rejected",
        errorCode: "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
        userMessage: "Le fournisseur a refusé le prompt vidéo avant le rendu.",
        creditState: "reserved",
      }).catch(() => undefined);
      throw error;
    }
    // A transport failure may happen after Fal accepted the request. Preserve the
    // reservation and permanently prevent a second submit for this segment.
    await patchVideoRow(id, {
      [stateKey]: "uncertain",
      ...(submittedJobId ? { [jobKey]: submittedJobId } : {}),
      phase: "uncertain",
      errorCode: "STUDIO_VIDEO_SUBMIT_UNCERTAIN",
      userMessage: "La soumission vidéo n’a pas pu être confirmée. Les crédits restent réservés; ne relance pas cette génération.",
      creditState: "uncertain",
    }).catch(() => undefined);
    await setDailyQuotaState(row, "uncertain").catch(() => undefined);
    return null;
  }
}
submitVideoSegmentStep.maxRetries = 0;

export async function pollVideoSegmentStep(jobId: string) {
  "use step";
  return getFalVideoJob(jobId);
}

export async function storeVideoSegmentStep(id: string, index: 0 | 1, jobId: string) {
  "use step";
  const row = await readVideoRow(id);
  if (!row) throw new Error("Tâche vidéo introuvable.");
  const metadata = row.metadata ?? {};
  const pathKey = `segment${index}StoragePath`;
  if (typeof metadata[pathKey] === "string") return metadata[pathKey] as string;
  const video = await downloadFalVideo(jobId);
  const storagePath = await storeStudioVideoArtifact(row.user_id, id, `segment-${index}.mp4`, video.body, video.contentType || "video/mp4");
  await patchVideoRow(id, {
    [`segment${index}State`]: "completed",
    [pathKey]: storagePath,
    phase: index === 0 ? "segment0_ready" : "segment1_ready",
    progress: index === 0 ? 42 : 82,
  });
  return storagePath;
}

export async function submitVideoContinuityFrameStep(id: string): Promise<string | null> {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.status !== "processing") return null;
  const metadata = row.metadata ?? {};
  if (typeof metadata.continuityFramePath === "string") return metadata.continuityFramePath;
  if (["submitting", "submitted", "uncertain"].includes(metadata.continuityFrameState) && typeof metadata.continuityFrameJobId === "string") {
    await setDailyQuotaState(row, "submitted");
    return metadata.continuityFrameJobId;
  }
  if (metadata.continuityFrameState !== "pending") return null;
  if (typeof metadata.segment0StoragePath !== "string") throw new Error("La première séquence n’est pas enregistrée.");

  const claim = await createAdminClient()
    .from("studio_generations")
    .update({ metadata: { ...metadata, continuityFrameState: "submitting", phase: "continuity_submitting", updatedAt: new Date().toISOString() } })
    .eq("id", id)
    .eq("user_id", row.user_id)
    .eq("metadata->>continuityFrameState", "pending")
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (claim.error) throw new FatalError("STUDIO_VIDEO_CONTINUITY_CLAIM_FAILED");
  if (!claim.data) return null;

  let jobId: string | null = null;
  try {
    const videoUrl = await signedStudioUrl(metadata.segment0StoragePath);
    jobId = await submitFalQueueUtility(FAL_EXTRACT_FRAME_ENDPOINT, { video_url: videoUrl, frame_type: "last" });
    const saved = await patchVideoRow(id, {
      continuityFrameJobId: jobId,
      continuityFrameState: "submitted",
      phase: "continuity_processing",
      progress: 45,
    });
    if (saved.continuityFrameJobId !== jobId || saved.continuityFrameState !== "submitted") throw new Error("La demande d’extraction Fal n’a pas pu être confirmée.");
    await setDailyQuotaState(row, "submitted");
    return jobId;
  } catch (error) {
    await patchVideoRow(id, {
      ...(jobId ? { continuityFrameJobId: jobId } : {}),
      continuityFrameState: "uncertain",
      phase: "uncertain",
      errorCode: "STUDIO_VIDEO_CONTINUITY_UNCERTAIN",
      userMessage: "L’extraction Fal du frame de continuité n’a pas pu être confirmée; aucune nouvelle soumission ne sera faite automatiquement.",
    }).catch(() => undefined);
    await setDailyQuotaState(row, "uncertain").catch(() => undefined);
    return null;
  }
}
submitVideoContinuityFrameStep.maxRetries = 0;

export async function storeVideoContinuityFrameStep(id: string, jobId: string) {
  "use step";
  const row = await readVideoRow(id);
  if (!row) throw new Error("Tâche vidéo introuvable.");
  const metadata = row.metadata ?? {};
  if (typeof metadata.continuityFramePath === "string") return metadata.continuityFramePath;
  if (metadata.continuityFrameJobId !== jobId || !["submitted", "uncertain"].includes(metadata.continuityFrameState)) throw new FatalError("STUDIO_VIDEO_CONTINUITY_JOB_MISMATCH");
  const image = await downloadFalQueueUtilityFile(jobId, "image");
  if (!image.contentType.startsWith("image/")) throw new Error("fal.ai n’a pas renvoyé une image de continuité.");
  const framePath = await storeStudioVideoArtifact(row.user_id, id, "continuity-frame.png", Buffer.from(image.body), image.contentType);
  await patchVideoRow(id, { continuityFramePath: framePath, continuityFrameState: "completed", phase: "continuity_ready", progress: 48 });
  return framePath;
}

export async function extractVideoContinuityFrameFallbackStep(id: string) {
  "use step";
  const row = await readVideoRow(id);
  if (!row) throw new Error("Tâche vidéo introuvable.");
  const metadata = row.metadata ?? {};
  if (typeof metadata.continuityFramePath === "string") return metadata.continuityFramePath;
  if (typeof metadata.segment0StoragePath !== "string") throw new Error("La première séquence vidéo n’est pas enregistrée.");
  const binaries = packagedVideoBinaries();
  if (!binaries) throw new Error("Le repli local de continuité n’est pas disponible.");
  const dir = await mkdtemp(path.join(tmpdir(), "vendeo-video-frame-fallback-"));
  let extractedPath = "";
  try {
    const clipPath = path.join(dir, "segment-0.mp4");
    await writeFile(clipPath, await readStudioVideoArtifact(metadata.segment0StoragePath));
    extractedPath = await extractLastFrame({ url: clipPath, duration: 15, index: 0 }, binaries.ffmpegPath);
    const framePath = await storeStudioVideoArtifact(row.user_id, id, "continuity-frame.png", await readFile(extractedPath), "image/png");
    await patchVideoRow(id, { continuityFramePath: framePath, continuityFrameState: "fallback", phase: "continuity_ready", progress: 48 });
    return framePath;
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (extractedPath) await rm(path.dirname(extractedPath), { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function submitVideoMergeStep(id: string): Promise<string | null> {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.status !== "processing") return null;
  const metadata = row.metadata ?? {};
  if (["submitting", "submitted", "uncertain", "completed"].includes(metadata.mergeState) && typeof metadata.mergeJobId === "string") {
    await setDailyQuotaState(row, "submitted");
    return metadata.mergeJobId;
  }
  if (metadata.mergeState !== "pending") return null;
  if (typeof metadata.segment0StoragePath !== "string" || typeof metadata.segment1StoragePath !== "string") throw new Error("Les deux séquences vidéo ne sont pas prêtes.");

  const claim = await createAdminClient()
    .from("studio_generations")
    .update({ metadata: { ...metadata, mergeState: "submitting", phase: "merge_submitting", progress: 86, updatedAt: new Date().toISOString() } })
    .eq("id", id)
    .eq("user_id", row.user_id)
    .eq("metadata->>mergeState", "pending")
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (claim.error) throw new FatalError("STUDIO_VIDEO_MERGE_CLAIM_FAILED");
  if (!claim.data) return null;

  let jobId: string | null = null;
  try {
    const videoUrls = await Promise.all([metadata.segment0StoragePath, metadata.segment1StoragePath].map((path: string) => signedStudioUrl(path)));
    jobId = await submitFalQueueUtility(FAL_MERGE_VIDEOS_ENDPOINT, {
      video_urls: videoUrls,
      resolution_aspect_ratio_video_index: 0,
    });
    const saved = await patchVideoRow(id, { mergeJobId: jobId, mergeState: "submitted", phase: "merge_processing", progress: 90 });
    if (saved.mergeJobId !== jobId || saved.mergeState !== "submitted") throw new Error("La demande Fal de fusion vidéo n’a pas pu être confirmée.");
    await setDailyQuotaState(row, "submitted");
    return jobId;
  } catch {
    await patchVideoRow(id, {
      ...(jobId ? { mergeJobId: jobId } : {}),
      mergeState: "uncertain",
      phase: "uncertain",
      errorCode: "STUDIO_VIDEO_MERGE_UNCERTAIN",
      userMessage: "La demande de fusion Fal n’a pas pu être confirmée; aucune nouvelle soumission ne sera faite automatiquement.",
    }).catch(() => undefined);
    await setDailyQuotaState(row, "uncertain").catch(() => undefined);
    return null;
  }
}
submitVideoMergeStep.maxRetries = 0;

export async function assembleAndFinalizeVideoStep(id: string, falMergeJobId: string | null) {
  "use step";
  const row = await readVideoRow(id);
  if (!row) throw new Error("Tâche vidéo introuvable.");
  if (row.status === "completed" && row.storage_path) return row.storage_path;
  const metadata = row.metadata ?? {};
  const plan = metadata.plan as VideoAdPlan | undefined;
  if (!plan || plan.duration !== 25 || typeof metadata.segment0StoragePath !== "string" || typeof metadata.segment1StoragePath !== "string") throw new Error("Les deux séquences vidéo ne sont pas prêtes.");

  let storagePath = row.storage_path;
  if (!storagePath) {
    const binaries = packagedVideoBinaries();
    if (!binaries) throw new Error("Le probe vidéo ou le repli audio sûr n’est pas disponible.");
    const dir = await mkdtemp(path.join(tmpdir(), "vendeo-video-final-"));
    try {
      let finalBytes: Buffer | null = null;
      let mergeMethod = "local-fallback";
      if (falMergeJobId) {
        try {
          const merged = await downloadFalQueueUtilityFile(falMergeJobId, "video");
          const mergedPath = path.join(dir, "fal-merged.mp4");
          await writeFile(mergedPath, Buffer.from(merged.body));
          validateFinalPortraitVideo(await probeVideoFile(mergedPath, binaries.ffprobePath));
          finalBytes = await readFile(mergedPath);
          mergeMethod = "fal-merge";
        } catch (error) {
          console.warn("[studio-video] Fal merge output failed strict 25s/9:16/audio validation; using the local safe fallback", {
            reason: error instanceof Error ? error.message.slice(0, 240) : "unknown",
          });
        }
      }

      if (!finalBytes) {
        const clips = [];
        for (const [index, assetPath] of [metadata.segment0StoragePath, metadata.segment1StoragePath].entries()) {
          const clipPath = path.join(dir, `segment-${index}.mp4`);
          await writeFile(clipPath, await readStudioVideoArtifact(assetPath));
          const probe = await probeVideoFile(clipPath, binaries.ffprobePath);
          const expectedDuration = plan.segments[index].duration;
          if (!probe.hasAudio || !Number.isFinite(probe.audioDuration) || probe.audioDuration + 0.1 < expectedDuration) {
            throw new Error(`La piste audio de la séquence ${index + 1} est absente ou trop courte; aucun résultat silencieux ne sera publié.`);
          }
          clips.push({ url: clipPath, duration: expectedDuration, index });
        }
        const outputPath = path.join(dir, "final-fallback.mp4");
        await assembleVideo(clips, plan, { ...binaries, outputPath, width: 720, height: 1280, fps: 30 });
        validateFinalPortraitVideo(await probeVideoFile(outputPath, binaries.ffprobePath));
        finalBytes = await readFile(outputPath);
      }

      storagePath = await storeStudioVideo({ body: finalBytes.buffer.slice(finalBytes.byteOffset, finalBytes.byteOffset + finalBytes.byteLength) as ArrayBuffer, contentType: "video/mp4" }, row.user_id, id);
      await patchVideoRow(id, { phase: "final_asset_saved", progress: 94, mergeMethod, mergeState: mergeMethod === "fal-merge" ? "completed" : "fallback" }, { storage_path: storagePath });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const transactionId = row.credit_transaction_id;
  if (!transactionId) throw new Error("La réservation de crédits n’est pas enregistrée.");
  const debit = await createAdminClient().rpc("complete_credit_debit", { transaction_id: transactionId });
  if (debit.error || debit.data !== true) throw new Error("Le débit final de crédits n’a pas été confirmé.");
  await patchVideoRow(id, {
    phase: "completed",
    progress: 100,
    creditState: "consumed",
    userMessage: "Vidéo prête.",
    errorCode: null,
  }, { status: "completed", storage_path: storagePath, error: null });
  await setDailyQuotaState(row, "completed");

  const current = await readVideoRow(id);
  const temporaryPaths = [current?.metadata?.segment0StoragePath, current?.metadata?.segment1StoragePath, current?.metadata?.continuityFramePath]
    .filter((value): value is string => typeof value === "string");
  await deleteStudioVideoArtifacts(temporaryPaths).catch(() => undefined);
  return storagePath;
}

export async function failVideoWorkflowStep(id: string, reason: "provider_rejected" | "provider_failed" | "assembly_failed" | "uncertain") {
  "use step";
  const row = await readVideoRow(id);
  if (!row || row.status === "completed" || row.status === "failed") return;
  const metadata = row.metadata ?? {};
  const previousSegmentGenerated = [metadata.segment0State, metadata.segment1State].includes("completed")
    || typeof metadata.segment0StoragePath === "string"
    || typeof metadata.segment1StoragePath === "string";
  let creditState: "uncertain" | "refunded" | "consumed" = "uncertain";
  const transactionId = row.credit_transaction_id;
  let transactionStatus: string | null = null;
  if (transactionId) {
    const transaction = await createAdminClient().from("credit_transactions").select("status").eq("id", transactionId).maybeSingle();
    if (!transaction.error) transactionStatus = transaction.data?.status ?? null;
  }
  if (transactionStatus === "refunded") creditState = "refunded";
  else if (transactionStatus === "completed") creditState = "consumed";
  const refundEligible = (reason === "provider_rejected" || reason === "provider_failed") && !previousSegmentGenerated;
  if (refundEligible) {
    if (transactionId && transactionStatus === "pending") {
      const refund = await createAdminClient().rpc("refund_credit_debit", { transaction_id: transactionId });
      if (!refund.error && refund.data === true) creditState = "refunded";
      else {
        const check = await createAdminClient().from("credit_transactions").select("status").eq("id", transactionId).maybeSingle();
        if (!check.error && check.data?.status === "refunded") creditState = "refunded";
        else if (!check.error && check.data?.status === "completed") creditState = "consumed";
      }
    }
  }
  const providerRejected = reason === "provider_rejected";
  const uncertain = creditState === "uncertain";
  const userMessage = previousSegmentGenerated
    ? creditState === "refunded"
      ? "Une séquence vidéo a déjà été générée avant l’échec, mais les crédits ont été libérés. Ne relance pas cette génération."
      : creditState === "consumed"
        ? "Une séquence vidéo a déjà été générée avant l’échec, et le débit de crédits est déjà finalisé. Ne relance pas cette génération."
        : "Une séquence vidéo a déjà été générée avant l’échec. Les crédits restent réservés et ne seront pas remboursés automatiquement. Ne relance pas cette génération."
    : providerRejected
      ? creditState === "refunded"
        ? "Le fournisseur a refusé le prompt avant le rendu; les crédits Studio ont été libérés."
        : creditState === "consumed"
          ? "Le fournisseur a refusé le prompt avant le rendu, mais le débit est déjà finalisé. Ne relance pas cette génération."
          : "Le fournisseur a refusé le prompt avant le rendu, mais la libération des crédits n’est pas confirmée. Ne relance pas cette génération."
      : creditState === "refunded"
        ? "La vidéo n’a pas pu être finalisée. Les crédits Studio ont été libérés."
        : creditState === "consumed"
          ? "Le résultat vidéo n’a pas pu être confirmé; le débit de crédits est déjà passé. Ne relance pas cette génération."
          : "Le suivi de cette génération est incertain. Les crédits restent réservés; ne relance pas la vidéo.";
  const rejectedSegmentKey = metadata.segment1State === "submitting" || metadata.segment1State === "submitted"
    ? "segment1State"
    : metadata.segment0State === "submitting" || metadata.segment0State === "submitted"
      ? "segment0State"
      : null;
  const nextMetadata = {
    ...metadata,
    ...(providerRejected && rejectedSegmentKey ? { [rejectedSegmentKey]: "rejected" } : {}),
    phase: uncertain ? "uncertain" : "failed",
    progress: metadata.progress ?? 0,
    creditState,
    errorCode: providerRejected ? "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED" : uncertain ? "STUDIO_VIDEO_UNCERTAIN" : "STUDIO_VIDEO_FAILED",
    userMessage,
    updatedAt: new Date().toISOString(),
  };
  const updated = await createAdminClient()
    .from("studio_generations")
    .update({ status: "failed", error: userMessage, metadata: nextMetadata })
    .eq("id", id)
    .eq("user_id", row.user_id)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (updated.error) throw new Error("Impossible d’enregistrer l’échec vidéo.");
  const providerTouched = [metadata.segment0State, metadata.segment1State]
    .some(state => ["submitting", "submitted", "completed", "uncertain"].includes(state));
  const quotaState = reason === "uncertain" ? "uncertain" : providerTouched ? "failed_spent" : creditState === "refunded" ? "released" : "uncertain";
  await setDailyQuotaState(row, quotaState);
}

export async function inspectVideoWorkflowStep(id: string) {
  "use step";
  const row = await readVideoRow(id);
  return row ? { status: row.status, storagePath: row.storage_path, metadata: row.metadata ?? {} } : null;
}

export async function studioVideoWorkflow(id: string) {
  "use workflow";
  try {
    if (!(await claimVideoWorkflowStep(id))) return;
    const initial = await inspectVideoWorkflowStep(id);
    if (!initial || initial.status !== "processing") return;
    for (const index of [0, 1] as const) {
      let jobId = await submitVideoSegmentStep(id, index);
      if (!jobId) {
        const current = await inspectVideoWorkflowStep(id);
        if (current?.metadata?.[index === 0 ? "segment0State" : "segment1State"] === "uncertain") {
          await failVideoWorkflowStep(id, "uncertain");
        }
        return;
      }
      let terminal: "completed" | "failed" | null = null;
      for (let attempt = 0; attempt < MAX_POLLS_PER_SEGMENT; attempt++) {
        const state = await pollVideoSegmentStep(jobId);
        if (state.status === "completed") { terminal = "completed"; break; }
        if (state.status === "failed") { terminal = "failed"; break; }
        await sleep(POLL_DELAY);
      }
      if (terminal === "failed") {
        await failVideoWorkflowStep(id, "provider_failed");
        return;
      }
      if (terminal !== "completed") {
        await failVideoWorkflowStep(id, "uncertain");
        return;
      }
      await storeVideoSegmentStep(id, index, jobId);
      if (index === 0) {
        const frameJobId = await submitVideoContinuityFrameStep(id);
        if (!frameJobId) {
          const current = await inspectVideoWorkflowStep(id);
          if (current?.metadata?.continuityFrameState === "uncertain") await failVideoWorkflowStep(id, "uncertain");
          return;
        }
        let frameTerminal: "completed" | "failed" | null = null;
        for (let attempt = 0; attempt < MAX_POLLS_PER_SEGMENT; attempt++) {
          const state = await pollVideoSegmentStep(frameJobId);
          if (state.status === "completed") { frameTerminal = "completed"; break; }
          if (state.status === "failed") { frameTerminal = "failed"; break; }
          await sleep(POLL_DELAY);
        }
        if (frameTerminal === "completed") await storeVideoContinuityFrameStep(id, frameJobId);
        else if (frameTerminal === "failed") await extractVideoContinuityFrameFallbackStep(id);
        else {
          await failVideoWorkflowStep(id, "uncertain");
          return;
        }
      }
    }

    const mergeJobId = await submitVideoMergeStep(id);
    if (!mergeJobId) {
      const current = await inspectVideoWorkflowStep(id);
      if (current?.metadata?.mergeState === "uncertain") {
        await failVideoWorkflowStep(id, "uncertain");
        return;
      }
      await assembleAndFinalizeVideoStep(id, null);
      return;
    }
    let mergeTerminal: "completed" | "failed" | null = null;
    for (let attempt = 0; attempt < MAX_POLLS_PER_SEGMENT; attempt++) {
      const state = await pollVideoSegmentStep(mergeJobId);
      if (state.status === "completed") { mergeTerminal = "completed"; break; }
      if (state.status === "failed") { mergeTerminal = "failed"; break; }
      await sleep(POLL_DELAY);
    }
    if (mergeTerminal === "completed") await assembleAndFinalizeVideoStep(id, mergeJobId);
    else if (mergeTerminal === "failed") await assembleAndFinalizeVideoStep(id, null);
    else await failVideoWorkflowStep(id, "uncertain");
  } catch (error) {
    const current = await inspectVideoWorkflowStep(id).catch(() => null);
    if (!current || current.status === "completed" || current.status === "failed") return;
    const metadata = current.metadata ?? {};
    const ambiguousSubmission = [metadata.segment0State, metadata.segment1State, metadata.continuityFrameState, metadata.mergeState]
      .some(state => state === "submitting" || state === "submitted" || state === "uncertain");
    const reason = isFalVideoInputRejectedError(error)
      ? "provider_rejected"
      : ambiguousSubmission ? "uncertain" : "assembly_failed";
    await failVideoWorkflowStep(id, reason).catch(() => undefined);
  }
}
