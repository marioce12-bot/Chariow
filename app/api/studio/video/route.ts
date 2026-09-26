import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { createFalVideo } from "@/lib/ai/fal";
import { videoCreditCost } from "@/lib/studio/credits";
import { parseStudioProduct } from "@/lib/studio/product-prompt";
import { buildCreativeBrief, briefToPrompt } from "@/lib/studio/creative-brief";
import { selectVideoModel } from "@/lib/studio/creative-models";
import { VIDEO_DURATIONS, VIDEO_RESOLUTIONS, VIDEO_ASPECT_RATIOS, isSupportedVideoDuration, isSupportedVideoResolution, isSupportedVideoAspectRatio } from "@/lib/studio/creative-workflows";

const cleanOption = (value: unknown, max = 120) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const subscriptionBlock = await requireActiveSubscription(user.id);
  if (subscriptionBlock) return subscriptionBlock;

  const body = await request.json().catch(() => ({}));
  const userPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const product = parseStudioProduct(body?.product);

  if ((!userPrompt && !product) || userPrompt.length > 4_000) return NextResponse.json({ error: "Décris la vidéo à créer ou choisis un produit." }, { status: 400 });

  // Validation stricte : on refuse toute durée/résolution/format que le workflow
  // ne produit pas réellement, au lieu de la transformer silencieusement.
  const duration = Number(body?.duration);
  if (!isSupportedVideoDuration(duration)) {
    return NextResponse.json({ error: `La durée doit être l'une des suivantes : ${VIDEO_DURATIONS.join(", ")} secondes.`, supported: VIDEO_DURATIONS }, { status: 400 });
  }
  const resolution = typeof body?.resolution === "string" && isSupportedVideoResolution(body.resolution) ? body.resolution : "1080p";
  const aspectRatio = typeof body?.aspectRatio === "string" && isSupportedVideoAspectRatio(body.aspectRatio) ? body.aspectRatio : "16:9";
  const referenceUrl = product?.imageUrl ?? null;

  // Le brief créatif structure la demande : direction artistique adaptée au type
  // de produit, sans inventer de caractéristique commerciale.
  const brief = buildCreativeBrief(
    { name: product?.name ?? "création", description: product?.description, price: product?.price, currency: product?.currency },
    userPrompt,
    "video",
    aspectRatio,
  );
  const prompt = briefToPrompt(brief, "video", Boolean(referenceUrl));
  const model = selectVideoModel(Boolean(referenceUrl));

  const cost = videoCreditCost(resolution, duration);
  const admin = createAdminClient();

  const { data: generation, error: generationError } = await admin
    .from("studio_generations")
    .insert({
      user_id: user.id,
      kind: "video",
      prompt,
      options: { duration, resolution, aspectRatio, theme: cleanOption(body?.theme) || undefined, ambiance: cleanOption(body?.ambiance) || undefined, characterType: cleanOption(body?.characterType) || undefined, videoType: cleanOption(body?.videoType) || undefined },
      metadata: { brief, workflow: "ltx-2.3", model, productType: brief.productType },
      status: "processing",
      credits_cost: cost,
    })
    .select("id")
    .single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });

  const requestId = crypto.randomUUID();
  const reservation = await admin.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_video", model_name: model, provider_amount: Math.round(cost / 1.5), request_id: requestId });
  if (reservation.error) {
    console.error("Studio credit reservation error", reservation.error.message, reservation.error.code);
    return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré.", details: process.env.NODE_ENV === "development" ? reservation.error.message : undefined }, { status: 503 });
  }
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok || !reserveResult.transaction_id) {
    return NextResponse.json({ error: `Solde insuffisant. Cette vidéo nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });
  }

  try {
    const jobId = await createFalVideo(prompt, { duration, resolution, aspectRatio, referenceUrl });
    // IMPORTANT : on ne débite PAS encore. La réservation reste "pending" et sera
    // finalisée à la réussite (complete) ou remboursée à l'échec (refund) dans la
    // route de suivi du job. On mémorise la transaction pour pouvoir le faire.
    await admin.from("studio_generations").update({ video_job_id: jobId, credit_transaction_id: reserveResult.transaction_id }).eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ jobId, status: "queued", cost, generationId: generation.id }, { status: 202 });
  } catch (error) {
    // Échec de soumission : on rembourse immédiatement la réservation.
    await admin.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: error instanceof Error ? error.message : "Erreur de génération" }).eq("id", generation.id).eq("user_id", user.id);
    const message = error instanceof Error ? error.message : "Erreur de génération vidéo.";
    console.error("fal.ai studio video error", message);
    return NextResponse.json({ error: "Impossible de démarrer la génération vidéo pour le moment." }, { status: 502 });
  }
}