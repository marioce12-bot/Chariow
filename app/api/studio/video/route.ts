import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { rateLimit } from "@/lib/shop/rate-limit";
import { createFalVideo } from "@/lib/ai/fal";
import { videoCreditCost } from "@/lib/studio/credits";
import { buildVideoAdPlan, videoPlanPrompt, type VideoAdInput } from "@/lib/studio/video-plan";
import { VIDEO_DURATIONS, VIDEO_RESOLUTIONS, VIDEO_ASPECT_RATIOS } from "@/lib/studio/creative-workflows";
import { sourceCopyCandidates } from "@/lib/studio/faithful-prompt";
import { resolveProductLanguage } from "@/lib/studio/product-language";

export const runtime = "nodejs";
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || JSON.stringify(body).length > 16_000 || !UUID.test(String(body.id ?? "")))
    return NextResponse.json({ error: "Identifiant de génération invalide." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("studio_generations")
    .select("id,user_id,status,video_job_id,metadata,created_at")
    .eq("id", body.id).maybeSingle();
  if (existing) {
    if (existing.user_id !== user.id || existing.metadata?.type !== "video_generation")
      return NextResponse.json({ error: "Demande indisponible." }, { status: 409 });
    if (!existing.video_job_id)
      return NextResponse.json({ error: "Le lancement est en cours de confirmation. Consulte l’historique avant de relancer." }, { status: 409 });
    return NextResponse.json({ job: { id: existing.video_job_id, status: existing.status } }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const product = body.product && typeof body.product === "object" ? body.product : null;
  const name = typeof product?.name === "string" ? product.name.trim().slice(0, 200) : "";
  const description = typeof product?.description === "string" ? product.description.trim().slice(0, 3_000) : "";
  const imageUrl = product?.imageUrl == null || product.imageUrl === "" ? null : product.imageUrl;
  const duration = Number(body.duration);
  const resolution = String(body.resolution ?? "");
  const aspectRatio = String(body.aspectRatio ?? "");
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4_000) : "";
  if (!name || !(VIDEO_DURATIONS as readonly number[]).includes(duration) ||
      !(VIDEO_RESOLUTIONS as readonly string[]).includes(resolution) ||
      !(VIDEO_ASPECT_RATIOS as readonly string[]).includes(aspectRatio) ||
      (imageUrl !== null && !validHttpsUrl(imageUrl)))
    return NextResponse.json({ error: "Choisis un produit et vérifie la durée, le format et la résolution." }, { status: 400 });

  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;
  if (rateLimit(`studio-video:${user.id}`, 2))
    return NextResponse.json({ error: "Trop de générations vidéo. Patiente une minute." }, { status: 429 });

  const locale = body.locale === "en" ? "en" : "fr";
  const planInput: VideoAdInput = { name, description, hasReference: Boolean(imageUrl), duration, aspectRatio, character: "auto", userBrief: userPrompt, locale };
  const prompt = userPrompt || videoPlanPrompt(buildVideoAdPlan(planInput));
  const approvedCopy = sourceCopyCandidates(description);
  const contentLanguage = resolveProductLanguage({ name, description }, locale);
  const providerPrompt = `${prompt}\n\nRÈGLES PRODUIT ET UGC (prioritaires) : produit sélectionné : ${JSON.stringify(name)}. Informations confirmées : ${JSON.stringify([name, ...approvedCopy])}. L'histoire et la situation doivent correspondre à ce produit; dialogues en ${contentLanguage.label}, naturels et courts, répartis entre les personnages si la scène en comporte plusieurs. Par défaut, les personnages adultes fictifs ont un teint métissé naturel, représenté respectueusement et sans caricature. N'invente aucun fait, bénéfice, avis, résultat, prix ou garantie; les affirmations parlées doivent rester dans les informations confirmées. ${imageUrl ? "Utilise impérativement l'image de référence fournie comme identité exacte du produit. Si c'est une couverture de livre numérique, montre-la sur un téléphone ou une tablette, face caméra et lisible, dans la partie centrale du clip pendant au moins 2 secondes; ne l'invente pas et ne la redessine pas." : "Aucune image de référence n'est fournie; ne fabrique pas de couverture ni d'emballage."} Génère une seule vidéo finale avec audio natif synchronisé, sans filigrane ni coupure abrupte.`;

  const cost = videoCreditCost(resolution, duration);
  const metadata = { type: "video_generation", provider: "fal", model: "bytedance/seedance-2.5/reference-to-video", duration, resolution, aspectRatio, productId: typeof product?.id === "string" ? product.id.slice(0, 200) : null, creditState: "reserving" };
  const inserted = await admin.from("studio_generations").insert({
    id: body.id, user_id: user.id, kind: "video", prompt: providerPrompt,
    options: { type: "ugc_video", duration, resolution, aspectRatio }, metadata,
    status: "processing", credits_cost: cost,
  }).select("id").single();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      const { data: raced } = await admin.from("studio_generations").select("user_id,video_job_id,metadata,status").eq("id", body.id).maybeSingle();
      if (raced?.user_id === user.id && raced.metadata?.type === "video_generation" && raced.video_job_id)
        return NextResponse.json({ job: { id: raced.video_job_id, status: raced.status } }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "L’historique Studio n’est pas disponible. Aucune vidéo n’a été lancée." }, { status: 503 });
  }

  const reservation = await admin.rpc("reserve_credits", {
    target_user_id: user.id, amount: cost, operation_name: "studio_video",
    model_name: "bytedance/seedance-2.5/reference-to-video", provider_amount: cost,
    request_id: body.id,
  });
  if (reservation.error) {
    await admin.from("studio_generations").delete().eq("id", body.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Impossible de réserver les crédits. Aucune vidéo n’a été lancée." }, { status: 503 });
  }
  const reserved = reservation.data as { ok?: boolean; balance?: number; required?: number; transaction_id?: string } | null;
  if (!reserved?.ok) {
    await admin.from("studio_generations").delete().eq("id", body.id).eq("user_id", user.id);
    return NextResponse.json({
      code: "INSUFFICIENT_CREDITS", required: cost, balance: reserved?.balance ?? 0,
      error: locale === "en" ? `Insufficient balance: this video costs ${cost} credits.` : `Solde insuffisant : cette vidéo coûte ${cost} crédits.`,
    }, { status: 402 });
  }
  if (!reserved.transaction_id) {
    await admin.from("studio_generations").update({ metadata: { ...metadata, creditState: "uncertain" } }).eq("id", body.id).eq("user_id", user.id);
    return NextResponse.json({ error: "La réservation de crédits doit être vérifiée avant toute génération. Consulte ton historique Studio." }, { status: 503 });
  }
  const reservationSaved = await admin.from("studio_generations").update({ credit_transaction_id: reserved.transaction_id, metadata: { ...metadata, creditState: "reserved" } }).eq("id", body.id).eq("user_id", user.id);
  if (reservationSaved.error) {
    const refund = await admin.rpc("refund_credit_debit", { transaction_id: reserved.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: "La réservation n’a pas pu être enregistrée.", metadata: { ...metadata, creditState: refund.error ? "uncertain" : "refunded" } }).eq("id", body.id).eq("user_id", user.id);
    return NextResponse.json({ error: "Le suivi de crédits est indisponible. La vidéo n’a pas été lancée." }, { status: 503 });
  }

  try {
    const jobId = await createFalVideo(providerPrompt, {
      duration: duration as 20 | 25 | 30,
      resolution: resolution as "480p" | "720p" | "1080p",
      aspectRatio: aspectRatio as "16:9" | "9:16" | "1:1",
      referenceUrl: imageUrl,
      endUserId: user.id,
    });
    const saved = await admin.from("studio_generations").update({
      video_job_id: jobId,
      metadata: { ...metadata, creditState: "reserved", contentLanguage: contentLanguage.label },
    }).eq("id", body.id).eq("user_id", user.id);
    if (saved.error) {
      return NextResponse.json({ error: "La génération a été lancée mais son suivi est temporairement indisponible. Ne relance pas la vidéo." }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ job: { id: jobId, status: "processing" }, generationId: body.id, cost }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const refund = await admin.rpc("refund_credit_debit", { transaction_id: reserved.transaction_id });
    await admin.from("studio_generations").update({ status: "failed", error: "La génération Fal n’a pas pu être mise en file.", metadata: { ...metadata, creditState: refund.error ? "uncertain" : "refunded" } }).eq("id", body.id).eq("user_id", user.id);
    console.error("fal.ai studio video submission failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de lancer la génération vidéo pour le moment. Les crédits ont été libérés si la réservation a abouti." }, { status: 502 });
  }
}
