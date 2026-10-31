import { NextResponse, after } from "next/server";
import { start } from "workflow/api";
import { requireUser } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/shop/rate-limit";
import { videoCreditCost } from "@/lib/studio/credits";
import { VIDEO_RESOLUTIONS, VIDEO_ASPECT_RATIOS, isSupportedVideoResolution, isSupportedVideoAspectRatio } from "@/lib/studio/creative-workflows";
import { isStudioVideoRenderEnabledForPreview } from "@/lib/studio/video-feature";
import { videoModelCapability, buildVideoAdPlan, type VideoAdInput } from "@/lib/studio/video-plan";
import { assertFalVideoPromptWithinSafeLimit, isFalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";
import { buildVideoProviderPlan } from "@/lib/studio/video-provider-prompts";
import { selectVideoModel } from "@/lib/studio/creative-models";
import { parseStudioProduct, buildStudioVideoPrompt } from "@/lib/studio/product-prompt";
import { packagedVideoBinaries } from "@/lib/studio/video-runtime";
import { studioVideoWorkflow, failQueuedVideoDispatchStep } from "@/lib/studio/video-workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  if (!isStudioVideoRenderEnabledForPreview()) {
    return NextResponse.json({ ready: false, locked: true, code: "STUDIO_VIDEO_LOCKED" }, { status: 423, headers: { "Cache-Control": "no-store" } });
  }
  const binaries = packagedVideoBinaries();
  if (!binaries) {
    return NextResponse.json({ ready: false, binaries: { ffmpeg: false, ffprobe: false } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ready: true, binaries: { ffmpeg: true, ffprobe: true }, duration: 25, segmentDurations: [15, 10] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  // Production is always locked, regardless of copied Preview environment variables.
  if (!isStudioVideoRenderEnabledForPreview()) {
    return NextResponse.json({ error: "La génération vidéo est indisponible hors de la Preview de test.", code: "STUDIO_VIDEO_LOCKED", locked: true }, { status: 423 });
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
  const product = parseStudioProduct(body?.product);
  if ((!prompt && !product) || prompt.length > 4_000) return NextResponse.json({ error: "Décris la vidéo à créer ou choisis un produit." }, { status: 400 });
  if (Number(body?.duration) !== 25) return NextResponse.json({ error: "Le rendu vidéo doit durer exactement 25 secondes (deux clips de 15 s puis 10 s).", supported: [25] }, { status: 400 });

  const resolution = typeof body?.resolution === "string" ? body.resolution : VIDEO_RESOLUTIONS[0];
  if (!isSupportedVideoResolution(resolution)) return NextResponse.json({ error: `Résolution vidéo non prise en charge. Choix disponibles : ${VIDEO_RESOLUTIONS.join(", ")}.` }, { status: 400 });
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "16:9";
  if (!isSupportedVideoAspectRatio(aspectRatio)) return NextResponse.json({ error: `Format vidéo non pris en charge. Choix disponibles : ${VIDEO_ASPECT_RATIOS.join(", ")}.` }, { status: 400 });
  const videoStyle = body?.videoStyle === undefined ? "motion_design" : body.videoStyle;
  if (videoStyle !== "motion_design" && videoStyle !== "ugc") return NextResponse.json({ error: "Choisis Motion design ou UGC." }, { status: 400 });

  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;
  if (rateLimit(`studio-video:${user.id}`, 3)) return NextResponse.json({ error: "Trop de demandes vidéo. Réessaie dans une minute." }, { status: 429 });
  if (!process.env.FAL_API_KEY) return NextResponse.json({ error: "Le fournisseur vidéo n’est pas configuré pour cette Preview. Aucun crédit n’a été réservé." }, { status: 503 });
  const binaries = packagedVideoBinaries();
  if (!binaries) return NextResponse.json({ error: "Pré-requis manquant : les binaires ffmpeg-static/ffprobe-static empaquetés sont absents. Aucun crédit n’a été réservé et aucun fournisseur n’a été appelé.", code: "STUDIO_VIDEO_BINARIES_UNAVAILABLE" }, { status: 503 });

  const model = selectVideoModel(Boolean(product?.imageUrl));
  try { videoModelCapability(model); }
  catch { return NextResponse.json({ error: "Le modèle vidéo configuré n’est pas vérifié pour cette Preview." }, { status: 503 }); }

  const userBrief = prompt.slice(0, 4_000);
  const composedPrompt = buildStudioVideoPrompt(userBrief, product, videoStyle);
  const input: VideoAdInput = {
    name: product?.name ?? "Création vidéo",
    description: product?.description ?? userBrief,
    hasReference: Boolean(product?.imageUrl),
    duration: 25,
    aspectRatio,
    character: "auto",
    videoStyle,
    userBrief,
    locale: body?.locale === "en" ? "en" : "fr",
  };
  let plan;
  try {
    const trustedPlan = buildVideoAdPlan(input, "", () => 0);
    plan = buildVideoProviderPlan(input, trustedPlan, product?.description ?? "");
    // Fail closed before reserving credits if a future compiler change exceeds the safe provider budget.
    for (const segment of plan.segments) assertFalVideoPromptWithinSafeLimit(segment.prompt);
  } catch (error) {
    if (isFalVideoInputRejectedError(error)) {
      return NextResponse.json({ error: "Le prompt vidéo dépasse la limite sûre du fournisseur. Aucun crédit n’a été réservé.", code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Le prompt vidéo n’a pas pu être préparé." }, { status: 400 });
  }

  const cost = videoCreditCost(resolution, 25);
  const reservation = await admin.rpc("reserve_credits", {
    target_user_id: user.id,
    amount: cost,
    operation_name: "studio_video",
    model_name: model,
    provider_amount: Math.round(cost / 1.5),
    request_id: id,
  });
  if (reservation.error) return NextResponse.json({ error: "Impossible de vérifier ou réserver les crédits Studio. Aucun fournisseur n’a été appelé." }, { status: 503 });
  const reserved = reservation.data as { ok?: boolean; duplicate?: boolean; balance?: number; reserved?: number; required?: number; transaction_id?: string } | null;
  if (!reserved?.ok) return NextResponse.json({ code: "INSUFFICIENT_CREDITS", error: `Solde insuffisant : cette vidéo coûte ${cost} crédits Studio, ton solde disponible est de ${Math.max(0, (reserved?.balance ?? 0) - (reserved?.reserved ?? 0))}. Aucun achat n’a été lancé.`, required: cost, balance: Math.max(0, (reserved?.balance ?? 0) - (reserved?.reserved ?? 0)) }, { status: 402 });
  if (reserved.duplicate || !reserved.transaction_id) {
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
    plan,
    resolution,
    aspectRatio,
    initialReferenceUrl: product?.imageUrl ?? null,
    segment0State: "pending",
    segment1State: "pending",
    creditState: "reserved",
    updatedAt: new Date().toISOString(),
  };
  const inserted = await admin.from("studio_generations").insert({
    id,
    user_id: user.id,
    kind: "video",
    prompt: composedPrompt,
    options: { duration: 25, resolution, aspectRatio, videoStyle },
    metadata,
    status: "processing",
    credits_cost: cost,
    video_job_id: id,
    credit_transaction_id: reserved.transaction_id,
  }).select("id").maybeSingle();
  if (inserted.error || !inserted.data) {
    await admin.rpc("refund_credit_debit", { transaction_id: reserved.transaction_id });
    return NextResponse.json({ error: "La tâche vidéo n’a pas pu être enregistrée. Aucun rendu n’a été lancé." }, { status: 503 });
  }

  after(async () => {
    try {
      await start(studioVideoWorkflow, [id]);
    } catch {
      await failQueuedVideoDispatchStep(id).catch(() => undefined);
    }
  });
  return NextResponse.json({ jobId: id, status: "processing", cost, progress: 0 }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
