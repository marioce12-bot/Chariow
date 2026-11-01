import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFalWebhookBody, verifyFalWebhook, FalWebhookVerificationUnavailableError } from "@/lib/ai/fal-webhook";
import { storeStudioVideoFromUrl } from "@/lib/studio/media";

export const runtime = "nodejs";
export const maxDuration = 120;

type FalPayload = {
  request_id?: unknown;
  status?: unknown;
  payload?: { video?: { url?: unknown } } | null;
};

export async function POST(request: Request) {
  const rawBody = await readFalWebhookBody(request);
  if (!rawBody) return NextResponse.json({ error: "Payload too large." }, { status: 413 });

  let verified = false;
  try { verified = await verifyFalWebhook(request.headers, rawBody); }
  catch (error) {
    if (error instanceof FalWebhookVerificationUnavailableError)
      return NextResponse.json({ error: "Webhook verification temporarily unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Webhook verification failed." }, { status: 503 });
  }
  if (!verified) return NextResponse.json({ error: "Invalid fal.ai signature." }, { status: 401 });

  let body: FalPayload;
  try { body = JSON.parse(rawBody.toString("utf8")) as FalPayload; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const signedRequestId = request.headers.get("x-fal-webhook-request-id");
  if (typeof body.request_id !== "string" || body.request_id !== signedRequestId || body.request_id.length > 256)
    return NextResponse.json({ error: "Request ID mismatch." }, { status: 400 });
  if (body.status !== "OK" && body.status !== "ERROR")
    return NextResponse.json({ error: "Unsupported fal.ai webhook status." }, { status: 400 });

  const admin = createAdminClient();
  const signedUserId = request.headers.get("x-fal-webhook-user-id");
  const { data: generation, error } = await admin.from("studio_generations")
    .select("id,user_id,kind,status,credit_transaction_id,metadata")
    .eq("provider_request_id", body.request_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Generation lookup failed." }, { status: 503 });
  if (!generation || generation.kind !== "video") return NextResponse.json({ error: "Video request not found." }, { status: 404 });
  if (!signedUserId || signedUserId.toLowerCase() !== generation.user_id.toLowerCase())
    return NextResponse.json({ error: "Webhook user does not match generation owner." }, { status: 403 });
  if (generation.status === "completed" || generation.status === "failed")
    return NextResponse.json({ accepted: true, duplicate: true });

  if (body.status === "ERROR") {
    if (generation.credit_transaction_id) {
      const refund = await admin.rpc("refund_credit_debit", { transaction_id: generation.credit_transaction_id });
      if (refund.error) return NextResponse.json({ error: "Credit refund is pending retry." }, { status: 503 });
    }
    const release = await admin.rpc("release_video_slot", { p_user_id: generation.user_id, p_request_id: generation.id });
    if (release.error) return NextResponse.json({ error: "Quota release is pending retry." }, { status: 503 });
    const saved = await admin.from("studio_generations").update({ status: "failed", error: "fal.ai n'a pas pu terminer la génération vidéo." })
      .eq("id", generation.id).eq("status", "processing").select("id");
    if (saved.error) return NextResponse.json({ error: "Failure state is pending retry." }, { status: 503 });
    return NextResponse.json({ accepted: true });
  }

  const videoUrl = body.payload?.video?.url;
  if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
    if (generation.credit_transaction_id) {
      const refund = await admin.rpc("refund_credit_debit", { transaction_id: generation.credit_transaction_id });
      if (refund.error) return NextResponse.json({ error: "Credit refund is pending retry." }, { status: 503 });
    }
    const release = await admin.rpc("release_video_slot", { p_user_id: generation.user_id, p_request_id: generation.id });
    if (release.error) return NextResponse.json({ error: "Quota release is pending retry." }, { status: 503 });
    const saved = await admin.from("studio_generations").update({ status: "failed", error: "Résultat fal.ai vidéo invalide." })
      .eq("id", generation.id).eq("status", "processing").select("id");
    if (saved.error) return NextResponse.json({ error: "Failure state is pending retry." }, { status: 503 });
    return NextResponse.json({ accepted: true });
  }
  if (process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT !== "true")
    return NextResponse.json({ error: "Private remote media storage is not enabled." }, { status: 503 });

  let storagePath: string;
  try { storagePath = await storeStudioVideoFromUrl(videoUrl, generation.user_id, generation.id); }
  catch { return NextResponse.json({ error: "Remote media import is pending retry." }, { status: 503 }); }
  if (generation.credit_transaction_id) {
    const debit = await admin.rpc("complete_credit_debit", { transaction_id: generation.credit_transaction_id });
    if (debit.error || debit.data !== true) return NextResponse.json({ error: "Credit completion is pending retry." }, { status: 503 });
  }
  const quota = await admin.rpc("complete_video_slot", { p_user_id: generation.user_id, p_request_id: generation.id });
  if (quota.error || quota.data?.completed !== true)
    return NextResponse.json({ error: "Quota completion is pending retry." }, { status: 503 });
  const saved = await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, error: null })
    .eq("id", generation.id).eq("status", "processing").select("id");
  if (saved.error) return NextResponse.json({ error: "Completion state is pending retry." }, { status: 503 });

  return NextResponse.json({ accepted: true });
}
