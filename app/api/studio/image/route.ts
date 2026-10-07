import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { generateFalImage, generateFalImageWithReferences, getAiImageEditModel, getAiImageModel, type StudioImageOptions } from "@/lib/ai/fal";
import { imageCreditCost } from "@/lib/studio/credits";
import { storeStudioImage, signedStudioUrl } from "@/lib/studio/media";
import { fetchReferenceImage } from "@/lib/studio/reference-image";

const qualities = ["medium", "high", "xhigh", "max"] as const;
const resolutions = ["hd", "full_hd", "2k", "4k"] as const;
const orientations = ["square", "landscape", "portrait"] as const;
const backgrounds = ["auto", "opaque", "transparent"] as const;
const outputFormats = ["png", "jpeg"] as const;

function oneOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]) {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const subscriptionBlock = await requireActiveSubscription(user.id);
  if (subscriptionBlock) return subscriptionBlock;

  const body = await request.json().catch(() => ({}));
  const userPrompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!userPrompt.trim() || userPrompt.length > 4_000) {
    return NextResponse.json({ error: "Décris l'image à créer en 1 à 4 000 caractères." }, { status: 400 });
  }

  const options: StudioImageOptions = {
    quality: oneOf(body?.quality, qualities, "medium"),
    resolution: oneOf(body?.resolution, resolutions, "hd"),
    orientation: oneOf(body?.orientation, orientations, "square"),
    background: oneOf(body?.background, backgrounds, "auto"),
    outputFormat: oneOf(body?.outputFormat, outputFormats, "png"),
  };
  const referenceUrls: string[] = Array.isArray(body?.referenceUrls)
    ? body.referenceUrls.filter((value: unknown): value is string => typeof value === "string").slice(0, 3)
    : [];
  const references = (await Promise.all(referenceUrls.map((url: string) => fetchReferenceImage(url)))).filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
  if (referenceUrls.length > 0 && references.length === 0) {
    return NextResponse.json({ error: "Les images de référence ne sont pas accessibles ou leur format n'est pas supporté." }, { status: 400 });
  }

  const format = options.orientation === "portrait" ? "story" : options.orientation === "landscape" ? "banner" : "square";
  const model = references.length ? getAiImageEditModel() : getAiImageModel();
  const cost = imageCreditCost(options.resolution ?? "hd", options.quality ?? "medium");

  // Le prompt est volontairement conservé tel quel : aucune réécriture métier,
  // ajout de produit ou consigne de composition ne doit modifier la demande.
  const admin = createAdminClient();
  const { data: generation, error: generationError } = await admin
    .from("studio_generations")
    .insert({
      user_id: user.id,
      kind: "image",
      prompt: userPrompt,
      options,
      metadata: { prompt: userPrompt, model, referenceCount: references.length },
      status: "processing",
      credits_cost: cost,
    })
    .select("id")
    .single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });

  const reservation = await admin.rpc("reserve_credits", {
    target_user_id: user.id,
    amount: cost,
    operation_name: "studio_image",
    model_name: model,
    provider_amount: Math.round(cost / 1.5),
    request_id: crypto.randomUUID(),
  });
  if (reservation.error) {
    console.error("Studio credit reservation error", reservation.error.message, reservation.error.code);
    return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré.", details: process.env.NODE_ENV === "development" ? reservation.error.message : undefined }, { status: 503 });
  }
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; required?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) return NextResponse.json({ error: `Solde insuffisant. Cette image nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });

  try {
    const imageUrl = references.length
      ? await generateFalImageWithReferences(userPrompt, references, options)
      : await generateFalImage(userPrompt, format, options);
    await admin.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    let storagePath: string | null = null;
    try { storagePath = await storeStudioImage(imageUrl, user.id, generation.id, options.outputFormat); } catch (storageError) { console.error("Studio image storage error", storageError); }
    await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath }).eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ imageUrl: storagePath ? await signedStudioUrl(storagePath) : imageUrl, generationId: generation.id, cost });
  } catch (error) {
    await admin.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: error instanceof Error ? error.message : "Erreur de génération" }).eq("id", generation.id).eq("user_id", user.id);
    const message = error instanceof Error ? error.message : "Erreur de génération d'image.";
    console.error("fal.ai studio image error", message);
    return NextResponse.json({ error: "Impossible de générer l'image pour le moment." }, { status: 502 });
  }
}
