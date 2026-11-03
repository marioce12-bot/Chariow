import { NextResponse, after } from "next/server";
import { start } from "workflow/api";
import { requireUser } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/shop/rate-limit";
import { videoCreditCost } from "@/lib/studio/credits";
import { STUDIO_VIDEO_RESOLUTIONS, inferProductType, isSupportedStudioVideoResolution } from "@/lib/studio/creative-workflows";
import { isStudioVideoEnabled } from "@/lib/studio/video-feature";
import { VIDEO_AD_DURATIONS, videoModelCapability } from "@/lib/studio/video-plan";
import { assertFalVideoPromptWithinSafeLimit, isFalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";
import { readUgcTimeline, UgcPromptGenerationError, validateUgcPrompt } from "@/lib/studio/ugc-prompt-generator";
import { normalizeUgcInput } from "@/lib/studio/ugc-prompt-input";
import { compileUgcPrompt, compileUgcProviderPlan, extractUgcNarrative } from "@/lib/studio/ugc-provider-assembler";
import { readPreparedUgc } from "@/lib/studio/ugc-prepared-plan";
import { selectVideoModel } from "@/lib/studio/creative-models";
import { parseStudioProduct } from "@/lib/studio/product-prompt";
import { studioVideoWorkflow, failQueuedVideoDispatchStep } from "@/lib/studio/video-workflow";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredFalWebhookUrl() {
  const raw = process.env.FAL_WEBHOOK_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/webhooks/fal") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await isStudioVideoEnabled())) {
    return NextResponse.json({ ready: false, locked: true, code: "STUDIO_VIDEO_LOCKED", error: "La génération vidéo est temporairement indisponible." }, { status: 423, headers: { "Cache-Control": "no-store" } });
  }
  const webhookUrl = configuredFalWebhookUrl();
  const cloudinaryReady = process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT === "true" && Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  const providerReady = Boolean(process.env.FAL_API_KEY);
  if (!cloudinaryReady || !providerReady) return NextResponse.json({ ready: false, code: "STUDIO_VIDEO_CONFIG_MISSING", storage: cloudinaryReady, provider: providerReady, callback: Boolean(webhookUrl) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ready: true, storage: "cloudinary-remote-import", provider: true, callback: Boolean(webhookUrl), callbackRequiredDurations: [10, 15], assembly: "fal-merge", supportedDurations: VIDEO_AD_DURATIONS, aspectRatio: "9:16" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (!(await isStudioVideoEnabled())) {
    return NextResponse.json({ error: "La génération vidéo est temporairement indisponible.", code: "STUDIO_VIDEO_LOCKED", locked: true }, { status: 423, headers: { "Cache-Control": "no-store" } });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Identifiant de génération invalide." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("studio_generations")
    .select("id,user_id,status,video_job_id,credits_cost,metadata")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Impossible de vérifier cette demande vidéo." }, { status: 503 });
  if (existing) {
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Demande vidéo indisponible." }, { status: 409 });
    return NextResponse.json({ jobId: existing.video_job_id || existing.id, status: existing.status, cost: existing.credits_cost, progress: existing.metadata?.progress ?? 0 }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const duration = body?.duration === undefined ? 10 : Number(body.duration);
  if (!(VIDEO_AD_DURATIONS as readonly number[]).includes(duration)) return NextResponse.json({
    error: `Durée invalide pour duration : valeurs autorisées ${VIDEO_AD_DURATIONS.join(", ")} secondes.`,
    code: "invalid_input", keyPath: "duration", supported: VIDEO_AD_DURATIONS,
  }, { status: 400 });
  const product = parseStudioProduct(body?.product);
  if (!product) return NextResponse.json({ error: "Choisis un produit réel de ta boutique pour construire un scénario adapté et le présenter fidèlement." }, { status: 400 });
  const input = normalizeUgcInput(body?.product, { ...(body?.ugcOptions && typeof body.ugcOptions === "object" ? body.ugcOptions : {}), duration }, body?.locale, prompt);
  product.imageUrl = input.product.images?.[0] ?? null;
  if (prompt.length > 4_000) return NextResponse.json({ error: "Le prompt vidéo dépasse la longueur autorisée." }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "Rédige ou génère le prompt vidéo avant de lancer le rendu." }, { status: 400 });
  const timeline = readUgcTimeline(extractUgcNarrative(prompt));
  const promptDuration = timeline.at(-1)?.end;
  if (timeline.length && promptDuration !== duration) {
    return NextResponse.json({
      code: "ugc_duration_mismatch",
      promptDuration,
      selectedDuration: duration,
      error: `Le prompt correspond à ${promptDuration} s, mais ${duration} s est sélectionné. Régénère le prompt avant le rendu.`,
    }, { status: 400 });
  }
  if (inferProductType(product.name, product.description) === "ebook" && !product.imageUrl) {
    return NextResponse.json({ error: "Ajoute ou sélectionne la couverture réelle de l’ebook pour qu’elle soit fidèlement présentée sur un téléphone ou une tablette.", code: "STUDIO_VIDEO_EBOOK_COVER_REQUIRED" }, { status: 400 });
  }
  const resolution = typeof body?.resolution === "string" ? body.resolution : STUDIO_VIDEO_RESOLUTIONS[0];
  if (!isSupportedStudioVideoResolution(resolution)) return NextResponse.json({ error: `Résolution vidéo non prise en charge. Choix tarifés : ${STUDIO_VIDEO_RESOLUTIONS.join(", ")}.` }, { status: 400 });
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "9:16";
  if (aspectRatio !== "9:16") return NextResponse.json({ error: "Le rendu vidéo Studio doit être en portrait 9:16." }, { status: 400 });
  // Le champ historique videoStyle est ignoré côté serveur : seul le mode UGC subsiste.
  const videoStyle = "ugc" as const;

  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;
  if (rateLimit(`studio-video:${user.id}`, 3)) return NextResponse.json({ error: "Trop de demandes vidéo. Réessaie dans une minute." }, { status: 429 });
  if (!process.env.FAL_API_KEY) return NextResponse.json({ error: "Le fournisseur vidéo n’est pas configuré pour cette Preview. Aucun crédit n’a été réservé." }, { status: 503 });
  if (process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT !== "true" || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return NextResponse.json({ error: "Le stockage vidéo Cloudinary n’est pas entièrement configuré. Aucun crédit n’a été réservé et aucun fournisseur n’a été appelé.", code: "STUDIO_VIDEO_STORAGE_UNAVAILABLE" }, { status: 503 });
  const webhookUrl = configuredFalWebhookUrl();
  if (duration !== 25 && !webhookUrl) return NextResponse.json({ error: "Configure FAL_WEBHOOK_URL vers /api/webhooks/fal pour les vidéos 10/15 s. Aucun crédit n’a été réservé.", code: "STUDIO_VIDEO_WEBHOOK_UNAVAILABLE" }, { status: 503 });

  const model = selectVideoModel(Boolean(product?.imageUrl));
  try { videoModelCapability(model); }
  catch { return NextResponse.json({ error: "Le modèle vidéo configuré n’est pas vérifié pour cette Preview." }, { status: 503 }); }

  const userBrief = prompt.slice(0, 4_000);
  let narrative: string;
  let composedPrompt: string;
  let plan;
  try {
    const prepared = readPreparedUgc(body?.preparedUgc, user.id, input, prompt);
    narrative = prepared?.narrative ?? extractUgcNarrative(prompt);
    validateUgcPrompt(narrative, input);
    composedPrompt = prepared?.prompt ?? compileUgcPrompt(input, narrative);
    plan = compileUgcProviderPlan(input, narrative);
    // Fail closed before reserving credits if a future compiler change exceeds the safe provider budget.
    for (const segment of plan.segments) assertFalVideoPromptWithinSafeLimit(segment.prompt);
  } catch (error) {
    if (isFalVideoInputRejectedError(error)) {
      return NextResponse.json({ error: "Le prompt vidéo dépasse la limite sûre du fournisseur. Aucun crédit n’a été réservé.", code: error.code }, { status: 400 });
    }
    if (error instanceof UgcPromptGenerationError) {
      console.info("Studio video prompt rejected", { stage: error.stage, type: error.details.type, keyPath: error.details.path ?? null });
    }
    return NextResponse.json({ error: "Le prompt vidéo n’a pas pu être préparé." }, { status: 400 });
  }

  const cost = videoCreditCost(resolution, duration);
  const quota = await admin.rpc("reserve_studio_video_quota", {
    p_user_id: user.id,
    p_generation_id: id,
    p_resolution: resolution,
  });
  if (quota.error) return NextResponse.json({ error: "Impossible de vérifier le plafond quotidien vidéo. Aucun crédit n’a été réservé ni aucun fournisseur appelé." }, { status: 503 });
  const quotaResult = quota.data as { ok?: boolean; duplicate?: boolean; code?: string } | null;
  if (!quotaResult?.ok) {
    const messages: Record<string, string> = {
      USER_ACTIVE_LIMIT: "Une seule vidéo peut être active à la fois.",
      USER_DAILY_LIMIT: "La limite est de deux vidéos par jour et par utilisateur.",
      GLOBAL_ACTIVE_LIMIT: "Le nombre maximal de générations vidéo simultanées est temporairement atteint. Réessaie plus tard.",
      UNPRICED_RESOLUTION: "Cette résolution n’a pas de tarif confirmé.",
      REQUEST_ALREADY_RESERVED: "Cette demande possède déjà une réservation de quota; elle n’a pas été relancée.",
    };
    const status = quotaResult?.code === "REQUEST_ALREADY_RESERVED" ? 409 : 429;
    return NextResponse.json({ code: quotaResult?.code ?? "STUDIO_VIDEO_QUOTA_BLOCKED", error: messages[quotaResult?.code ?? ""] ?? "Le plafond quotidien vidéo empêche cette demande." }, { status });
  }
  const reservation = await admin.rpc("reserve_credits", {
    target_user_id: user.id,
    amount: cost,
    operation_name: "studio_video",
    model_name: model,
    provider_amount: Math.round(cost / 1.5),
    request_id: id,
  });
  if (reservation.error) {
    await Promise.resolve(admin.rpc("set_studio_video_quota_state", { p_user_id: user.id, p_generation_id: id, p_state: "uncertain" })).catch(() => undefined);
    return NextResponse.json({ error: "Impossible de confirmer la réservation des crédits Studio; aucun fournisseur n’a été appelé. Ne relance pas cette demande." }, { status: 503 });
  }
  const reserved = reservation.data as { ok?: boolean; duplicate?: boolean; balance?: number; reserved?: number; required?: number; transaction_id?: string } | null;
  if (!reserved?.ok) {
    await Promise.resolve(admin.rpc("set_studio_video_quota_state", { p_user_id: user.id, p_generation_id: id, p_state: "released" })).catch(() => undefined);
    return NextResponse.json({ code: "INSUFFICIENT_CREDITS", error: `Solde insuffisant : cette vidéo coûte ${cost} crédits Studio, ton solde disponible est de ${Math.max(0, (reserved?.balance ?? 0) - (reserved?.reserved ?? 0))}. Aucun achat n’a été lancé.`, required: cost, balance: Math.max(0, (reserved?.balance ?? 0) - (reserved?.reserved ?? 0)) }, { status: 402 });
  }
  if (reserved.duplicate || !reserved.transaction_id) {
    await Promise.resolve(admin.rpc("set_studio_video_quota_state", { p_user_id: user.id, p_generation_id: id, p_state: "uncertain" })).catch(() => undefined);
    return NextResponse.json({ code: "STUDIO_VIDEO_REQUEST_UNCERTAIN", error: "Cette demande possède déjà une réservation. Elle n’a pas été relancée afin d’éviter un doublon." }, { status: 409 });
  }

  const metadata = {
    type: "studio_video_workflow",
    phase: "queued",
    progress: 0,
    prompt: composedPrompt,
    userPrompt: userBrief,
    videoStyle,
    product: product ?? null,
    ugcScenario: narrative,
    plan,
    resolution,
    aspectRatio,
    initialReferenceUrl: product?.imageUrl ?? null,
    segment0State: "pending",
    segment1State: plan.segments.length > 1 ? "pending" : "not_required",
    continuityFrameState: plan.segments.length > 1 ? "pending" : "not_required",
    mergeState: plan.segments.length > 1 ? "pending" : "not_required",
    creditState: "reserved",
    updatedAt: new Date().toISOString(),
  };
  const inserted = await admin.from("studio_generations").insert({
    id,
    user_id: user.id,
    kind: "video",
    prompt: composedPrompt,
    options: { duration, resolution, aspectRatio, videoStyle },
    metadata,
    status: "processing",
    credits_cost: cost,
    video_job_id: id,
    credit_transaction_id: reserved.transaction_id,
  }).select("id").maybeSingle();
  if (inserted.error || !inserted.data) {
    const refundConfirmed = await confirmCreditTransition(admin, "refund_credit_debit", reserved.transaction_id, { userId: user.id, amount: cost });
    await Promise.resolve(admin.rpc("set_studio_video_quota_state", {
      p_user_id: user.id,
      p_generation_id: id,
      p_state: refundConfirmed ? "released" : "uncertain",
    })).catch(() => undefined);
    return NextResponse.json({ error: "La tâche vidéo n’a pas pu être enregistrée. Aucun rendu n’a été lancé; l’état du quota/crédit est conservé pour vérification." }, { status: 503 });
  }

  after(async () => {
    try {
      await start(studioVideoWorkflow, [id]);
    } catch {
      await failQueuedVideoDispatchStep(id).catch(() => undefined);
    }
  });
  return NextResponse.json({ jobId: id, status: "processing", cost, duration, progress: 0 }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
