import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import {
  generateFalImage,
  generateFalImageWithReferences,
  getAiImageEditModel,
  getAiImageModel,
  type StudioImageOptions,
} from "@/lib/ai/fal";
import { imageCreditCost } from "@/lib/studio/credits";
import { storeStudioImage, signedStudioUrl } from "@/lib/studio/media";
import { fetchReferenceImage } from "@/lib/studio/reference-image";
import { buildPremiumImagePrompt } from "@/lib/studio/premium-prompt";
import { validateSlideshowImageRequest } from "@/lib/studio/slideshow-image-request";
import { validateCreativePerformanceStudioSource } from "@/lib/creative-performance/studio-source";

const qualities = ["medium", "high", "xhigh", "max"] as const;
const resolutions = ["hd", "full_hd", "2k", "4k"] as const;
const orientations = ["square", "landscape", "portrait"] as const;
const backgrounds = ["auto", "opaque", "transparent"] as const;
const outputFormats = ["png", "jpeg"] as const;

function oneOf<T extends readonly string[]>(
  value: unknown,
  values: T,
  fallback: T[number],
) {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export async function generateStudioImage(
  userId: string,
  body: any,
  stage?: { generationId: string; taskId: string; step: number },
): Promise<Response> {
  let slideshow: ReturnType<typeof validateSlideshowImageRequest> | undefined;
  if (Object.hasOwn(body ?? {}, "slideshow")) {
    try {
      slideshow = validateSlideshowImageRequest(
        body.slideshow,
        process.env.VERCEL_ENV,
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Storyboard invalide.",
        },
        { status: 400 },
      );
    }
  }
  const subscriptionBlock = await requireActiveSubscription(userId);
  if (subscriptionBlock) return subscriptionBlock;
  const admin = createAdminClient();
  if (body?.creativePerformanceSource) {
    const validated = await validateCreativePerformanceStudioSource(admin, userId, body);
    if (validated.error)
      return NextResponse.json({ code: "CREATIVE_SOURCE_NOT_READY", error: validated.error }, { status: 409 });
    body.creativePerformanceSource = validated.source;
  }

  const userPrompt =
    slideshow?.prompt ?? (typeof body?.prompt === "string" ? body.prompt : "");
  if (!userPrompt.trim() || userPrompt.length > 4_000) {
    return NextResponse.json(
      { error: "Décris l'image à créer en 1 à 4 000 caractères." },
      { status: 400 },
    );
  }

  const options: StudioImageOptions = {
    quality: oneOf(body?.quality, qualities, "medium"),
    resolution: oneOf(body?.resolution, resolutions, "hd"),
    orientation:
      slideshow?.orientation ??
      oneOf(body?.orientation, orientations, "square"),
    background: oneOf(body?.background, backgrounds, "auto"),
    outputFormat: oneOf(body?.outputFormat, outputFormats, "png"),
  };
  const referenceUrls: string[] =
    slideshow?.referenceUrls ??
    (Array.isArray(body?.referenceUrls)
      ? body.referenceUrls
          .filter(
            (value: unknown): value is string => typeof value === "string",
          )
          .slice(0, 3)
      : []);
  const references = (
    await Promise.all(
      referenceUrls.map((url: string) => fetchReferenceImage(url)),
    )
  ).filter((reference): reference is NonNullable<typeof reference> =>
    Boolean(reference),
  );
  if (referenceUrls.length > 0 && references.length === 0) {
    return NextResponse.json(
      {
        error:
          "Les images de référence ne sont pas accessibles ou leur format n'est pas supporté.",
      },
      { status: 400 },
    );
  }

  const finalPrompt = buildPremiumImagePrompt({
    prompt: userPrompt,
    orientation: options.orientation ?? "square",
    background: options.background ?? "auto",
    hasReferences: references.length > 0,
  });

  const format =
    options.orientation === "portrait"
      ? "story"
      : options.orientation === "landscape"
        ? "banner"
        : "square";
  const model = references.length ? getAiImageEditModel() : getAiImageModel();
  const cost = imageCreditCost(
    options.resolution ?? "hd",
    options.quality ?? "medium",
  );

  const generationMetadata = {
    prompt: finalPrompt, originalPrompt: userPrompt,
    promptVersion: "premium-creative-director-v1", model,
    referenceCount: references.length,
    ...(body?.creativePerformanceSource ? { creativePerformanceSource: body.creativePerformanceSource } : {}),
    ...(body?.creativeIdea ? { creativeIdea: body.creativeIdea } : {}),
    ...(stage ? { taskId: stage.taskId, step: stage.step, creditState: "none" } : {}),
  };
  const { data: generation, error: generationError } = await admin
    .from("studio_generations")
    .insert({
      ...(stage ? { id: stage.generationId } : {}),
      user_id: userId,
      kind: "image",
      prompt: finalPrompt,
      options,
      metadata: generationMetadata,
      status: "processing",
      credits_cost: cost,
    })
    .select("id")
    .single();
  if (generationError) {
    if (stage && generationError.code === "23505") {
      const existing = await admin.from("studio_generations").select("id,user_id,status,storage_path,credits_cost").eq("id", stage.generationId).eq("user_id", userId).maybeSingle();
      if (!existing.error && existing.data?.status === "completed" && existing.data.storage_path) {
        return NextResponse.json({ imageUrl: await signedStudioUrl(existing.data.storage_path), generationId: stage.generationId, cost: existing.data.credits_cost ?? cost });
      }
      return stagedUncertain(stage, cost);
    }
    return NextResponse.json(
      { error: "L'historique Studio n'est pas configuré." },
      { status: 503 },
    );
  }

  const reservation = await admin.rpc("reserve_credits", {
    target_user_id: userId,
    amount: cost,
    operation_name: "studio_image",
    model_name: model,
    provider_amount: Math.round(cost / 1.5),
    request_id: stage?.generationId ?? crypto.randomUUID(),
  });
  if (reservation.error) {
    if (stage) { await setCreditState(admin, userId, stage.generationId, generationMetadata, "uncertain"); return stagedUncertain(stage, cost, "reservation_error"); }
    console.error(
      "Studio credit reservation error",
      reservation.error.message,
      reservation.error.code,
    );
    return NextResponse.json(
      {
        error: "Le système de crédits n'est pas encore configuré.",
        details:
          process.env.NODE_ENV === "development"
            ? reservation.error.message
            : undefined,
      },
      { status: 503 },
    );
  }
  const reserveResult = reservation.data as {
    ok?: boolean;
    balance?: number;
    required?: number;
    transaction_id?: string;
  } | null;
  if (!reserveResult?.ok) {
    // Refused before any reservation or provider call: nothing was charged. For a staged step, drop the
    // placeholder row so the very same step can be retried safely after a top-up (no "uncertain" state).
    if (stage) await admin.from("studio_generations").delete().eq("id", generation.id).eq("user_id", userId).eq("status", "processing");
    return NextResponse.json(
      {
        error: `Solde insuffisant. Cette image nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`,
        code: "INSUFFICIENT_CREDITS",
        required: cost,
        balance: reserveResult?.balance ?? 0,
      },
      { status: 402 },
    );
  }

  if (stage && !reserveResult.transaction_id) return stagedUncertain(stage, cost, "reservation_unconfirmed");
  if (stage && !(await setCreditState(admin, userId, generation.id, generationMetadata, "reserved"))) return stagedUncertain(stage, cost, "persistence_error");
  try {
    const imageUrl = references.length
      ? await generateFalImageWithReferences(finalPrompt, references, options)
      : await generateFalImage(finalPrompt, format, options);
    let storagePath: string | null = null;
    try {
      storagePath = await storeStudioImage(
        imageUrl,
        userId,
        generation.id,
        options.outputFormat,
      );
    } catch (storageError) {
      if (stage) console.error("Studio staged image", { taskId: stage.taskId, step: stage.step, status: 502, errorCode: "STUDIO_STORAGE_FAILED", creditState: "uncertain", cost });
      else console.error("Studio image storage error", storageError);
    }
    // A carousel cannot be assembled from a transient/failed provider URL. Fail honestly,
    // keep the existing refund path and never launch another generation automatically.
    if (slideshow && !storagePath)
      throw new Error(
        "Le visuel n’a pas pu être sauvegardé. Montage annulé, aucune nouvelle génération automatique.",
      );
    // Preserve the acquired asset before financial acknowledgement. A lost debit response
    // must not discard a paid provider result or make it eligible for another paid call.
    if (stage && storagePath) {
      const stored = await admin.from("studio_generations").update({ storage_path: storagePath }).eq("id", generation.id).eq("user_id", userId);
      if (stored.error) return stagedUncertain(stage, cost, "asset_persistence_error");
    }
    const debit = await admin.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    if (stage && (debit.error || debit.data !== true)) { await setCreditState(admin, userId, generation.id, generationMetadata, "uncertain"); return stagedUncertain(stage, cost, "debit_error"); }
    if (stage && !(await setCreditState(admin, userId, generation.id, generationMetadata, "consumed"))) return stagedUncertain(stage, cost, "persistence_error");
    const saved = await admin
      .from("studio_generations")
      .update({ status: "completed", storage_path: storagePath, ...(stage ? { metadata: { ...generationMetadata, creditState: "consumed" } } : {}) })
      .eq("id", generation.id)
      .eq("user_id", userId);
    if (slideshow && saved?.error)
      throw new Error(
        "Le visuel n’a pas pu être enregistré dans l’historique. Montage annulé.",
      );
    return NextResponse.json({
      imageUrl: storagePath ? await signedStudioUrl(storagePath) : imageUrl,
      generationId: generation.id,
      cost,
    });
  } catch (error) {
    const refund = await admin.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    if (stage) {
      const state = refund.error ? "uncertain" : "refunded";
      if (!(await setCreditState(admin, userId, generation.id, generationMetadata, state))) return stagedUncertain(stage, cost, "persistence_error");
    }
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Erreur de génération",
      })
      .eq("id", generation.id)
      .eq("user_id", userId);
    const message =
      error instanceof Error ? error.message : "Erreur de génération d'image.";
    if (stage) console.error("Studio staged image", { taskId: stage.taskId, step: stage.step, status: 502, errorCode: "provider_error", creditState: "uncertain", cost });
    else console.error("fal.ai studio image error", message);
    return NextResponse.json(
      { error: "Impossible de générer l'image pour le moment." },
      { status: 502 },
    );
  }
}


async function setCreditState(admin: any, userId: string, id: string, metadata: Record<string, unknown>, creditState: string) {
  const result = await admin.from("studio_generations").update({ metadata: { ...metadata, creditState } }).eq("id", id).eq("user_id", userId).select("id");
  return !result?.error && Boolean(result?.data?.length);
}
function stagedUncertain(stage: { taskId: string; step: number }, cost: number, errorCode = "stage_uncertain") {
  console.error("Studio staged image", { taskId: stage.taskId, step: stage.step, status: 409, errorCode, creditState: "uncertain", cost });
  return NextResponse.json({ error: "Cette étape nécessite une vérification manuelle.", code: "STUDIO_STAGE_UNCERTAIN" }, { status: 409 });
}
