import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateImoleImage } from "@/lib/ai/imole";
import { imageCreditCost } from "@/lib/studio/credits";
import { signedStudioUrl, storeStudioImage } from "@/lib/studio/media";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const generationId = typeof body?.generationId === "string" ? body.generationId : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!generationId || !instruction || instruction.length > 2000) return NextResponse.json({ error: "Décris la modification en 1 à 2 000 caractères." }, { status: 400 });
  const { data: source, error: sourceError } = await supabase.from("studio_generations").select("*").eq("id", generationId).eq("user_id", user.id).eq("kind", "image").maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  const options = source.options as Record<string, string>;
  const cost = imageCreditCost((options.resolution || "hd") as keyof typeof import("@/lib/studio/credits").IMAGE_COSTS, (options.quality || "medium") as keyof typeof import("@/lib/studio/credits").IMAGE_COSTS.hd);
  const { data: generation, error: generationError } = await supabase.from("studio_generations").insert({ user_id: user.id, kind: "image", prompt: `${source.prompt}\nModification demandée : ${instruction}`, options, status: "processing", credits_cost: cost, parent_id: source.id }).select("id").single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });
  const reservation = await supabase.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_image_edit", model_name: "imole-image", provider_amount: Math.round(cost / 1.5), request_id: crypto.randomUUID() });
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (reservation.error || !reserveResult?.ok) { await supabase.from("studio_generations").update({ status: "failed", error: reservation.error?.message || "Solde insuffisant" }).eq("id", generation.id); return NextResponse.json({ error: `Solde insuffisant. Cette modification nécessite ${cost} crédits.`, balance: reserveResult?.balance ?? 0 }, { status: reservation.error ? 503 : 402 }); }
  try {
    // Imọlẹ ne publie pas de contrat d'édition exploitable dans sa documentation publique.
    // Repli volontaire : régénération avec le prompt d'origine et l'instruction.
    const imageUrl = await generateImoleImage(`${source.prompt}. Modification demandée : ${instruction}`, "square", { ...options, outputFormat: options.outputFormat as "png" | "jpeg" });
    await supabase.rpc("complete_credit_debit", { transaction_id: reserveResult.transaction_id });
    let storagePath: string | null = null;
    try { storagePath = await storeStudioImage(imageUrl, user.id, generation.id, options.outputFormat || "png"); } catch (storageError) { console.error("Studio edit storage error", storageError); }
    await supabase.from("studio_generations").update({ status: "completed", storage_path: storagePath }).eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ imageUrl: storagePath ? await signedStudioUrl(storagePath) : imageUrl, generationId: generation.id, cost });
  } catch (error) {
    await supabase.rpc("refund_credit_debit", { transaction_id: reserveResult.transaction_id });
    await supabase.from("studio_generations").update({ status: "failed", error: error instanceof Error ? error.message : "Erreur de modification" }).eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Impossible de modifier l'image pour le moment." }, { status: 502 });
  }
}
