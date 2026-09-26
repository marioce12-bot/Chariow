import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { generateFalImage, generateFalImageWithReferences, type StudioImageOptions } from "@/lib/ai/fal";
import { imageCreditCost } from "@/lib/studio/credits";
import { storeStudioImage, signedStudioUrl } from "@/lib/studio/media";
import { parseStudioProduct } from "@/lib/studio/product-prompt";
import { buildCreativeBrief, briefToPrompt } from "@/lib/studio/creative-brief";
import { selectImageModel, imageTaskForProductType } from "@/lib/studio/creative-models";
import { inferProductType } from "@/lib/studio/creative-workflows";
import { fetchReferenceImage } from "@/lib/studio/reference-image";

const imageModes = ["fast", "advanced"] as const;
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
  const userPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const product = parseStudioProduct(body?.product);
  if ((!userPrompt && !product) || userPrompt.length > 4_000) {
    return NextResponse.json({ error: "Décris l'image à créer en 1 à 4 000 caractères." }, { status: 400 });
  }

  const options: StudioImageOptions = {
    imageMode: oneOf(body?.imageMode, imageModes, "fast"),
    quality: oneOf(body?.quality, qualities, "medium"),
    resolution: oneOf(body?.resolution, resolutions, "hd"),
    orientation: oneOf(body?.orientation, orientations, "square"),
    background: oneOf(body?.background, backgrounds, "auto"),
    outputFormat: oneOf(body?.outputFormat, outputFormats, "png"),
  };
  const reference = product?.imageUrl ? await fetchReferenceImage(product.imageUrl) : null;
  const productType = product ? inferProductType(product.name, product.description) : "autre";
  const brief = buildCreativeBrief(
    { name: product?.name ?? "création", description: product?.description, price: product?.price, currency: product?.currency },
    userPrompt,
    "image",
    options.orientation ?? "square",
  );
  const prompt = briefToPrompt(brief, "image", Boolean(reference));
  const model = selectImageModel(imageTaskForProductType(productType, Boolean(reference)));

  const cost = imageCreditCost(options.resolution ?? "hd", options.quality ?? "medium");
  // Ecritures + RPC credits : client service-role. RLS n'expose que le SELECT
  // aux utilisateurs, et les fonctions de credits sont revoquees pour `authenticated`.
  const admin = createAdminClient();
  const { data: generation, error: generationError } = await admin.from("studio_generations").insert({ user_id: user.id, kind: "image", prompt, options, metadata: { brief, workflow: imageTaskForProductType(productType, Boolean(reference)), model, productType }, status: "processing", credits_cost: cost }).select("id").single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });
  const requestId = crypto.randomUUID();
  const reservation = await admin.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_image", model_name: "fal-image", provider_amount: Math.round(cost / 1.5), request_id: requestId });
  if (reservation.error) {
    console.error("Studio credit reservation error", reservation.error.message, reservation.error.code);
    return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré.", details: process.env.NODE_ENV === "development" ? reservation.error.message : undefined }, { status: 503 });
  }
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; required?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) return NextResponse.json({ error: `Solde insuffisant. Cette image nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });

  try {
    const imageUrl = reference ? await generateFalImageWithReferences(prompt, [reference], options) : await generateFalImage(prompt, "square", options);
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
