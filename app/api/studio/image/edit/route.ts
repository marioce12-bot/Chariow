import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { generateFalImage, generateFalImageFromUrl, getAiImageEditModel } from "@/lib/ai/fal";
import { imageCreditCost } from "@/lib/studio/credits";
import { signedStudioUrl, storeStudioImage } from "@/lib/studio/media";
import { buildImageEditInstruction } from "@/lib/studio/image-edit-prompt";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const subscriptionBlock = await requireActiveSubscription(user.id);
  if (subscriptionBlock) return subscriptionBlock;
  const body = await request.json().catch(() => ({}));
  const generationId = typeof body?.generationId === "string" ? body.generationId : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!generationId || !instruction || instruction.length > 2000) return NextResponse.json({ error: "Décris la modification en 1 à 2 000 caractères." }, { status: 400 });
  const { data: source, error: sourceError } = await supabase.from("studio_generations").select("*").eq("id", generationId).eq("user_id", user.id).eq("kind", "image").maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  const options = source.options as Record<string, string>;
  const cost = imageCreditCost((options.resolution || "hd") as keyof typeof import("@/lib/studio/credits").IMAGE_COSTS, (options.quality || "medium") as keyof typeof import("@/lib/studio/credits").IMAGE_COSTS.hd);
  // Ecritures + RPC credits : client service-role. La lecture ci-dessus reste
  // faite avec le client utilisateur, donc bornee par RLS.
  const admin = createAdminClient();
  const editInstruction = buildImageEditInstruction(instruction);
  const editedPrompt = `${source.prompt}\nRequested edit: ${editInstruction}`;
  const { data: generation, error: generationError } = await admin.from("studio_generations").insert({ user_id: user.id, kind: "image", prompt: editedPrompt, options, status: "processing", credits_cost: cost, parent_id: source.id }).select("id").single();
  if (generationError) return NextResponse.json({ error: "L'historique Studio n'est pas configuré." }, { status: 503 });
  const quota = await admin.rpc("reserve_image_slot", { p_user_id: user.id, p_request_id: generation.id });
  if (quota.error) {
    await admin.from("studio_generations").delete().eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Impossible de vérifier le quota image." }, { status: 503 });
  }
  if (!(quota.data as { ok?: boolean } | null)?.ok) {
    await admin.from("studio_generations").delete().eq("id", generation.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Le quota quotidien de génération d’images est atteint.", code: "DAILY_IMAGE_LIMIT" }, { status: 429, headers: { "Cache-Control": "private, no-store" } });
  }
  const reservation = await admin.rpc("reserve_credits", { target_user_id: user.id, amount: cost, operation_name: "studio_image_edit", model_name: getAiImageEditModel(), provider_amount: Math.round(cost / 1.5), request_id: crypto.randomUUID() });
  const reserveResult = reservation.data as { ok?: boolean; balance?: number; transaction_id?: string } | null;
  if (reservation.error || !reserveResult?.ok) { await admin.rpc("release_image_slot", { p_user_id: user.id, p_request_id: generation.id }); await admin.from("studio_generations").update({ status: "failed", error: reservation.error?.message || "Solde insuffisant" }).eq("id", generation.id); return NextResponse.json({ error: `Solde insuffisant. Cette modification nécessite ${cost} crédits.`, balance: reserveResult?.balance ?? 0 }, { status: reservation.error ? 503 : 402 }); }
  try {
    // fal.ai expose un vrai modèle d'édition à partir d'une URL d'image (contrairement
    // à Imole, qui ne documentait aucun contrat d'édition exploitable) : on repart de
    // l'image déjà générée quand elle est disponible, sinon on retombe sur une
    // régénération à partir du prompt d'origine et de l'instruction.
    const sourceImageUrl = source.storage_path ? await signedStudioUrl(source.storage_path, user.id).catch(() => null) : null;
    const imageUrl = sourceImageUrl
      ? await generateFalImageFromUrl(editInstruction, sourceImageUrl)
      : await generateFalImage(editedPrompt, "square", { ...options, outputFormat: options.outputFormat as "png" | "jpeg" });
    const storagePath = await storeStudioImage(imageUrl, user.id, generation.id, options.outputFormat || "png");
    const signedUrl = await signedStudioUrl(storagePath, user.id);
    const debitConfirmed = await confirmCreditTransition(admin, "complete_credit_debit", reserveResult.transaction_id, { userId: user.id, amount: cost });
    if (!debitConfirmed) throw new Error("Credit completion failed");
    const quotaCompletion = await admin.rpc("complete_image_slot", { p_user_id: user.id, p_request_id: generation.id });
    if (quotaCompletion.error || quotaCompletion.data?.completed !== true) throw new Error("Image quota completion failed");
    const saved = await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath })
      .eq("id", generation.id).eq("user_id", user.id).select("id");
    if (saved.error || !saved.data?.length) throw new Error("Studio edit state could not be saved");
    return NextResponse.json({ imageUrl: signedUrl, generationId: generation.id, cost });
  } catch (error) {
    const refundConfirmed = await confirmCreditTransition(admin, "refund_credit_debit", reserveResult.transaction_id, { userId: user.id, amount: cost });
    const release = await admin.rpc("release_image_slot", { p_user_id: user.id, p_request_id: generation.id });
    const failed = await admin.from("studio_generations")
      .update({ status: "failed", error: error instanceof Error ? error.message : "Erreur de modification" })
      .eq("id", generation.id).eq("user_id", user.id).select("id");
    if (!refundConfirmed || release.error || failed.error || !failed.data?.length) {
      console.error("Studio image edit compensation is pending", {
        refund: refundConfirmed ? null : "not_confirmed",
        release: release.error?.code ?? null,
        state: failed.error?.code ?? (failed.data?.length ? null : "not_saved"),
      });
      return NextResponse.json({ error: "L'opération a échoué; la compensation est en cours de reprise." }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ error: "Impossible de modifier l'image pour le moment." }, { status: 502 });
  }
}
