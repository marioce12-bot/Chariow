import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { generateImoleImage, type StudioImageOptions } from "@/lib/ai/imole";
import { imageCreditCost } from "@/lib/studio/credits";

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
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 4_000) {
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

  const cost = imageCreditCost(options.resolution ?? "hd", options.quality ?? "medium");
  const requestId = crypto.randomUUID();
  const reservation = await (supabase.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_image", model_name: "imole-image", provider_amount: Math.round(cost / 1.5), request_id: requestId }));
  if (reservation.error) return NextResponse.json({ error: "Le système de crédits n'est pas encore configuré." }, { status: 503 });
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; required?: number; transaction_id?: string } | null;
  if (!reserveResult?.ok) return NextResponse.json({ error: `Solde insuffisant. Cette image nécessite ${cost} crédits, ton solde est de ${reserveResult?.balance ?? 0}.`, required: cost, balance: reserveResult?.balance ?? 0 }, { status: 402 });

  try {
    const imageUrl = await generateImoleImage(prompt, "square", options);
    await supabase.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    return NextResponse.json({ imageUrl });
  } catch (error) {
    await supabase.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    const message = error instanceof Error ? error.message : "Erreur de génération d'image.";
    console.error("Imole studio image error", message);
    return NextResponse.json({ error: "Impossible de générer l'image pour le moment." }, { status: 502 });
  }
}
