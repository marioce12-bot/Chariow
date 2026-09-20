import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createImoleVideo } from "@/lib/ai/imole";
import { videoCreditCost } from "@/lib/studio/credits";

const resolutions = ["480p", "768p"] as const;
const aspectRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const duration = Number(body?.duration);
  const resolution = typeof body?.resolution === "string" && resolutions.includes(body.resolution as (typeof resolutions)[number]) ? body.resolution as (typeof resolutions)[number] : "480p";
  const aspectRatio = typeof body?.aspectRatio === "string" && aspectRatios.includes(body.aspectRatio as (typeof aspectRatios)[number]) ? body.aspectRatio : "16:9";

  if (!prompt || prompt.length > 4_000) return NextResponse.json({ error: "Décris la vidéo à créer en 1 à 4 000 caractères." }, { status: 400 });
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) return NextResponse.json({ error: "La durée doit être comprise entre 4 et 15 secondes." }, { status: 400 });

  const cost = videoCreditCost(resolution, duration);
  const requestId = crypto.randomUUID();
  const reservation = await supabase.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_video", model_name: "imole-video", provider_amount: Math.round(cost / 1.5), request_id: requestId });
  if (reservation.error) return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré." }, { status: 503 });
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) return NextResponse.json({ error: `Solde insuffisant. Cette vidéo nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });

  try {
    const jobId = await createImoleVideo(prompt, { duration, resolution, aspectRatio });
    await supabase.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    return NextResponse.json({ jobId, status: "queued", cost }, { status: 202 });
  } catch (error) {
    await supabase.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    const message = error instanceof Error ? error.message : "Erreur de génération vidéo.";
    console.error("Imole studio video error", message);
    return NextResponse.json({ error: "Impossible de démarrer la génération vidéo pour le moment." }, { status: 502 });
  }
}
