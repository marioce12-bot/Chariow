import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { createFalVideo } from "@/lib/ai/fal";
import { createFalComposition, createFalAssembly, getFalMediaUrl, getFalQueueStatus, downloadFalMedia, type FalAssemblyTrack } from "@/lib/ai/fal-video";
import { buildVideoAdPlan, type VideoAdInput } from "@/lib/studio/video-plan";
import { videoCreditCost } from "@/lib/studio/credits";
import { storeStudioVideo } from "@/lib/studio/media";
import { isSupportedVideoAspectRatio, isSupportedVideoTotalDuration } from "@/lib/studio/creative-workflows";

export const runtime = "nodejs";
export const maxDuration = 300;

function resolution(value: unknown) {
  return value === "1080p" ? "1080p" : value === "720p" ? "720p" : "480p";
}
function publicJob(id: string, metadata: any) {
  return { id: `studio::${id}`, status: metadata.phase === "completed" ? "completed" : metadata.phase === "failed" ? "failed" : "processing", progress: metadata.progress ?? 1, message: metadata.message ?? "Préparation de la vidéo…", contentUrl: metadata.result?.contentUrl ?? null };
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null) as Record<string, any> | null;
  const duration = Number(body?.duration);
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "9:16";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 7000) : "";
  const product = body?.product && typeof body.product === "object" ? body.product : null;
  if (!prompt) return NextResponse.json({ error: "Génère ou renseigne un scénario avant de lancer la vidéo." }, { status: 400 });
  if (!isSupportedVideoTotalDuration(duration)) return NextResponse.json({ error: "La durée doit être de 20, 25 ou 30 secondes." }, { status: 400 });
  if (!isSupportedVideoAspectRatio(aspectRatio)) return NextResponse.json({ error: "Format vidéo non pris en charge." }, { status: 400 });
  const subscriptionBlock = await requireActiveSubscription(user.id);
  if (subscriptionBlock) return subscriptionBlock;

  const input: VideoAdInput = {
    name: typeof product?.name === "string" ? product.name.slice(0, 200) : "Produit Chariow",
    description: typeof product?.description === "string" ? product.description.slice(0, 3000) : "",
    hasReference: typeof product?.imageUrl === "string" && /^https:\/\//i.test(product.imageUrl),
    duration,
    aspectRatio,
    character: "with",
    userBrief: prompt,
    locale: body?.locale === "en" ? "en" : "fr",
  };
  const plan = buildVideoAdPlan(input, "");
  const id = crypto.randomUUID();
  const admin = createAdminClient();
  const selectedResolution = resolution(body?.resolution);
  const cost = videoCreditCost(selectedResolution, duration);
  const metadata: any = {
    type: "ugc_video", version: 1, phase: "processing", progress: 2, message: "Génération de la première scène…", creditState: "none", creditTransactionId: null,
    duration, aspectRatio, resolution: selectedResolution, product: { id: product?.id ?? null, name: input.name, coverUrl: product?.imageUrl ?? null },
    plan, segments: plan.segments.map((segment) => ({ index: segment.index, duration: segment.duration, status: "queued", falJobId: null, url: null })),
    currentSegment: 0, segmentUrls: [], assembly: { status: "queued", falJobId: null }, coverMoment: plan.coverMoment,
  };
  const inserted = await admin.from("studio_generations").insert({
    id, user_id: user.id, kind: "video", prompt, options: { type: "ugc_video", duration, aspectRatio, resolution: selectedResolution }, status: "processing", credits_cost: cost,
    video_job_id: `studio::${id}`, metadata,
  }).select("id").single();
  if (inserted.error) return NextResponse.json({ error: "L’historique Studio n’est pas configuré." }, { status: 503 });
  const reservation = await admin.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_video_ugc", model_name: "fal-ai/ugc-video", provider_amount: Math.round(cost / 1.5), request_id: id });
  if (reservation.error) {
    await admin.from("studio_generations").update({ status: "failed", error: "Le système de crédits n’est pas configuré." }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ error: "Le système de crédits n’est pas encore configuré." }, { status: 503 });
  }
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok || !reserveResult.transaction_id) {
    await admin.from("studio_generations").delete().eq("id", id).eq("user_id", user.id).eq("status", "processing");
    return NextResponse.json({ error: `Solde insuffisant. Cette vidéo nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, code: "INSUFFICIENT_CREDITS", required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });
  }
  metadata.creditState = "reserved";
  metadata.creditTransactionId = reserveResult.transaction_id;
  const first = plan.segments[0];
  try {
    const firstJob = await createFalVideo(first.prompt, { duration: first.duration as any, resolution: selectedResolution as any, aspectRatio: aspectRatio as any });
    metadata.segments[0].status = "processing";
    metadata.segments[0].falJobId = firstJob;
  } catch (error) {
    await admin.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: error instanceof Error ? error.message : "Échec du fournisseur vidéo.", metadata: { ...metadata, creditState: "refunded" } }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ error: "Impossible de lancer la génération vidéo." }, { status: 502 });
  }
  await admin.from("studio_generations").update({ metadata }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ jobId: `studio::${id}`, status: "processing", plan: { duration, coverMoment: plan.coverMoment } }, { status: 202 });
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !jobId.startsWith("studio::")) return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });
  const id = jobId.slice("studio::".length);
  const admin = createAdminClient();
  const { data: row } = await admin.from("studio_generations").select("id,status,metadata,storage_path").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
  const metadata = row.metadata ?? {};
  if (metadata.phase === "completed" || metadata.phase === "failed") return NextResponse.json(publicJob(id, metadata));

  try {
    const current = Number(metadata.currentSegment ?? 0);
    const segments = Array.isArray(metadata.segments) ? metadata.segments : [];
    const active = segments[current];
    if (active?.falJobId && active.status === "processing") {
      const status = await getFalQueueStatus(active.falJobId);
      if (status.status === "processing") return NextResponse.json(publicJob(id, { ...metadata, progress: 5 + Math.round((current / Math.max(1, segments.length)) * 70), message: `Génération de la scène ${current + 1}/${segments.length}…` }));
      if (status.status === "failed") throw new Error(`La scène ${current + 1} a échoué chez fal.`);
      active.url = await getFalMediaUrl(active.falJobId);
      active.status = "completed";
      metadata.segmentUrls = [...(metadata.segmentUrls ?? []), active.url];
      if (current + 1 < segments.length) {
        const next = segments[current + 1];
        const nextPrompt = metadata.plan.segments[current + 1].prompt;
        next.falJobId = await createFalVideo(nextPrompt, { duration: next.duration as any, resolution: metadata.resolution ?? "720p", aspectRatio: metadata.aspectRatio as any, referenceUrl: active.url });
        next.status = "processing";
        metadata.currentSegment = current + 1;
        metadata.progress = 10 + Math.round(((current + 1) / segments.length) * 70);
        metadata.message = `Génération de la scène ${current + 2}/${segments.length}…`;
        await admin.from("studio_generations").update({ metadata });
        return NextResponse.json(publicJob(id, metadata));
      }
      const coverUrl = metadata.product?.coverUrl;
      const urls: string[] = metadata.segmentUrls;
      const timelineKeyframes = urls.map((url, index) => ({ timestamp: metadata.plan.segments.slice(0, index).reduce((sum: number, item: any) => sum + item.duration, 0) * 1000, duration: metadata.plan.segments[index].duration * 1000, url }));
      if (typeof coverUrl === "string" && /^https:\/\//i.test(coverUrl)) {
        const coverStart = Number(metadata.coverMoment?.startSecond ?? 1) * 1000;
        const coverDuration = Number(metadata.coverMoment?.durationSecond ?? 3) * 1000;
        const before = timelineKeyframes.find((item) => item.timestamp <= coverStart && coverStart < item.timestamp + item.duration);
        if (before) {
          const beforeEnd = before.timestamp + before.duration;
          before.duration = Math.max(1, coverStart - before.timestamp);
          timelineKeyframes.splice(timelineKeyframes.indexOf(before) + 1, 0, { timestamp: coverStart, duration: coverDuration, url: coverUrl }, { timestamp: coverStart + coverDuration, duration: Math.max(1, beforeEnd - coverStart - coverDuration), url: before.url });
        }
      }
      const tracks: FalAssemblyTrack[] = [{
        id: "ugc-timeline", type: "video", keyframes: timelineKeyframes,
      }];
      const assembly = coverUrl ? await createFalComposition(tracks) : await createFalAssembly(urls, metadata.aspectRatio === "9:16" ? "portrait_16_9" : metadata.aspectRatio === "1:1" ? "square" : "landscape_16_9");
      metadata.assembly = { status: "processing", falJobId: assembly.jobId };
      metadata.phase = "assembling";
      metadata.progress = 85;
      metadata.message = "Assemblage final sur fal…";
      await admin.from("studio_generations").update({ metadata });
      return NextResponse.json(publicJob(id, metadata));
    }
    if (metadata.assembly?.falJobId) {
      const assemblyStatus = await getFalQueueStatus(metadata.assembly.falJobId);
      if (assemblyStatus.status === "processing") return NextResponse.json(publicJob(id, { ...metadata, progress: 90, message: "Assemblage final sur fal…" }));
      if (assemblyStatus.status === "failed") throw new Error("L’assemblage fal a échoué.");
      const media = await downloadFalMedia(metadata.assembly.falJobId);
      const storagePath = await storeStudioVideo(media, user.id, id);
      if (metadata.creditState === "reserved" && metadata.creditTransactionId) {
        const debit = await admin.rpc("complete_credit_debit", { transaction_id: metadata.creditTransactionId });
        metadata.creditState = debit.error || debit.data !== true ? "uncertain" : "consumed";
      }
      metadata.phase = "completed"; metadata.progress = 100; metadata.message = "Vidéo prête."; metadata.result = { contentUrl: `/api/studio/video/${encodeURIComponent(jobId)}/content` };
      await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, metadata, error: null });
      return NextResponse.json(publicJob(id, metadata));
    }
    return NextResponse.json(publicJob(id, metadata));
  } catch (error) {
    const message = error instanceof Error ? error.message : "La génération vidéo a échoué.";
    if (metadata.creditState === "reserved" && metadata.creditTransactionId) {
      const refund = await admin.rpc("refund_credit_debit", { transaction_id: metadata.creditTransactionId });
      metadata.creditState = refund.error ? "uncertain" : "refunded";
    }
    metadata.phase = "failed"; metadata.message = message; metadata.error = message;
    await admin.from("studio_generations").update({ status: "failed", metadata, error: message });
    return NextResponse.json(publicJob(id, metadata));
  }
}
