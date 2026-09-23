import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { createImoleVideo } from "@/lib/ai/imole";
import { videoCreditCost } from "@/lib/studio/credits";
import { buildStudioPrompt, parseStudioProduct, type StudioVideoOptions } from "@/lib/studio/product-prompt";

const resolutions = ["480p", "768p"] as const;
const aspectRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

// Petits réglages optionnels (thème, ambiance, personnage, type de vidéo) choisis par
// l'utilisateur dans le Studio. On ne valide pas contre une liste fermée côté serveur —
// ce texte n'est qu'un fragment de phrase inséré dans le prompt, jamais exécuté — mais on
// le nettoie et on le plafonne en longueur comme les autres champs de ce fichier.
const cleanOption = (value: unknown, max = 120) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const subscriptionBlock = await requireActiveSubscription(user.id);
  if (subscriptionBlock) return subscriptionBlock;

  const body = await request.json().catch(() => ({}));
  const userPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const product = parseStudioProduct(body?.product);
  const duration = Number(body?.duration);
  const resolution = typeof body?.resolution === "string" && resolutions.includes(body.resolution as (typeof resolutions)[number]) ? body.resolution as (typeof resolutions)[number] : "480p";
  const aspectRatio = typeof body?.aspectRatio === "string" && aspectRatios.includes(body.aspectRatio as (typeof aspectRatios)[number]) ? body.aspectRatio : "16:9";
  const videoOptions: StudioVideoOptions = {
    theme: cleanOption(body?.theme) || undefined,
    ambiance: cleanOption(body?.ambiance) || undefined,
    characterType: cleanOption(body?.characterType) || undefined,
    videoType: cleanOption(body?.videoType) || undefined,
  };

  if ((!userPrompt && !product) || userPrompt.length > 4_000) return NextResponse.json({ error: "Décris la vidéo à créer ou choisis un produit." }, { status: 400 });
  if (!Number.isInteger(duration) || duration < 4 || duration > 40) return NextResponse.json({ error: "La durée doit être comprise entre 4 et 40 secondes." }, { status: 400 });

  const prompt = buildStudioPrompt("video", userPrompt, product, Boolean(product?.imageUrl), videoOptions);
  const referenceMode = body?.referenceMode === "image" ? "image" : "reference";
  const referenceUrl = product?.imageUrl ?? null;
  const cost = videoCreditCost(resolution, duration);
  // Ecritures + RPC credits : client service-role. RLS n'expose que le SELECT
  // aux utilisateurs, et les fonctions de credits sont revoquees pour `authenticated`.
  const admin = createAdminClient();
  const { data: generation, error: generationError } = await admin.from("studio_generations").insert({ user_id: user.id, kind: "video", prompt, options: { duration, resolution, aspectRatio, ...videoOptions }, status: "processing", credits_cost: cost }).select("id").single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });
  const requestId = crypto.randomUUID();
  const reservation = await admin.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_video", model_name: "imole-video", provider_amount: Math.round(cost / 1.5), request_id: requestId });
  if (reservation.error) {
    console.error("Studio credit reservation error", reservation.error.message, reservation.error.code);
    return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré.", details: process.env.NODE_ENV === "development" ? reservation.error.message : undefined }, { status: 503 });
  }
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) return NextResponse.json({ error: `Solde insuffisant. Cette vidéo nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });

  try {
    const jobId = await createImoleVideo(prompt, { duration, resolution, aspectRatio, referenceUrl, referenceMode });
    await admin.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    await admin.from("studio_generations").update({ video_job_id: jobId }).eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ jobId, status: "queued", cost, generationId: generation.id }, { status: 202 });
  } catch (error) {
    await admin.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: error instanceof Error ? error.message : "Erreur de génération" }).eq("id", generation.id).eq("user_id", user.id);
    const message = error instanceof Error ? error.message : "Erreur de génération vidéo.";
    console.error("Imole studio video error", message);
    return NextResponse.json({ error: "Impossible de démarrer la génération vidéo pour le moment." }, { status: 502 });
  }
}
