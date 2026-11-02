import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFalWebhookBody, verifyFalWebhook, FalWebhookVerificationUnavailableError } from "@/lib/ai/fal-webhook";
import { storeStudioVideoFromUrl } from "@/lib/studio/media";

export const runtime = "nodejs";
export const maxDuration = 120;

const FAILURE_MESSAGE = "fal.ai n'a pas pu terminer la génération vidéo.";
const INVALID_RESULT_MESSAGE = "Résultat fal.ai vidéo invalide.";
const RETRY_HEADERS = { "Retry-After": "60", "Cache-Control": "no-store" };

type FalPayload = {
  request_id?: unknown;
  status?: unknown;
  payload?: { video?: { url?: unknown } } | null;
};
type ClaimedGeneration = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  credit_transaction_id: string | null;
  storage_path: string | null;
};

async function failClaimedGeneration(admin: ReturnType<typeof createAdminClient>, generation: ClaimedGeneration, leaseToken: string, errorMessage: string) {
  if (generation.credit_transaction_id) {
    const refund = await admin.rpc("refund_credit_debit", { transaction_id: generation.credit_transaction_id });
    if (refund.error || refund.data !== true)
      return NextResponse.json({ error: "Credit refund is pending retry." }, { status: 503, headers: RETRY_HEADERS });
  }
  const release = await admin.rpc("release_video_slot", { p_user_id: generation.user_id, p_request_id: generation.id });
  if (release.error)
    return NextResponse.json({ error: "Quota release is pending retry." }, { status: 503, headers: RETRY_HEADERS });
  const saved = await admin.rpc("finish_studio_video_callback", {
    p_generation_id: generation.id, p_lease_token: leaseToken, p_final_status: "failed", p_storage_path: null, p_error: errorMessage,
  });
  if (saved.error || saved.data !== true)
    return NextResponse.json({ error: "Failure state is pending retry." }, { status: 503, headers: RETRY_HEADERS });
  return NextResponse.json({ accepted: true });
}

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
  const signedUserId = request.headers.get("x-fal-webhook-user-id");
  if (typeof body.request_id !== "string" || body.request_id !== signedRequestId || body.request_id.length > 256 || !signedUserId)
    return NextResponse.json({ error: "Request ID or signed user is invalid." }, { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signedUserId))
    return NextResponse.json({ error: "Webhook user does not match generation owner." }, { status: 403 });
  if (body.status !== "OK" && body.status !== "ERROR")
    return NextResponse.json({ error: "Unsupported fal.ai webhook status." }, { status: 400 });

  const leaseToken = randomUUID();
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_studio_video_callback", {
    p_request_id: body.request_id, p_user_id: signedUserId, p_callback_status: body.status, p_lease_token: leaseToken,
  });
  if (claim.error || !claim.data)
    return NextResponse.json({ error: "Callback claim is temporarily unavailable." }, { status: 503, headers: RETRY_HEADERS });
  const claimResult = claim.data as { outcome?: string; generation?: ClaimedGeneration };
  if (claimResult.outcome === "not_found") return NextResponse.json({ error: "Video request not found." }, { status: 404 });
  if (claimResult.outcome === "owner_mismatch") return NextResponse.json({ error: "Webhook user does not match generation owner." }, { status: 403 });
  if (claimResult.outcome === "conflict") return NextResponse.json({ error: "Conflicting terminal callback status." }, { status: 409 });
  if (claimResult.outcome === "terminal") return NextResponse.json({ accepted: true, duplicate: true });
  if (claimResult.outcome === "busy")
    return NextResponse.json({ error: "A matching callback is already being processed; retry later." }, { status: 503, headers: RETRY_HEADERS });
  const generation = claimResult.generation;
  if (claimResult.outcome !== "claimed" || !generation || generation.kind !== "video" || generation.status !== "processing")
    return NextResponse.json({ error: "Video callback could not be claimed." }, { status: 503, headers: RETRY_HEADERS });
  if (body.status === "ERROR") return failClaimedGeneration(admin, generation, leaseToken, FAILURE_MESSAGE);

  const videoUrl = body.payload?.video?.url;
  if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://"))
    return failClaimedGeneration(admin, generation, leaseToken, INVALID_RESULT_MESSAGE);
  if (process.env.STUDIO_MEDIA_CLOUDINARY_IMPORT !== "true")
    return NextResponse.json({ error: "Private remote media storage is not enabled." }, { status: 503, headers: RETRY_HEADERS });

  let storagePath = generation.storage_path;
  if (!storagePath) {
    try { storagePath = await storeStudioVideoFromUrl(videoUrl, generation.user_id, generation.id); }
    catch { return NextResponse.json({ error: "Remote media import is pending retry." }, { status: 503, headers: RETRY_HEADERS }); }
    const stored = await admin.rpc("record_studio_video_callback_asset", {
      p_generation_id: generation.id, p_lease_token: leaseToken, p_storage_path: storagePath,
    });
    if (stored.error || stored.data !== true)
      return NextResponse.json({ error: "Remote media record is pending retry." }, { status: 503, headers: RETRY_HEADERS });
  }
  const completed = await admin.rpc("complete_studio_video_callback", {
    p_generation_id: generation.id, p_lease_token: leaseToken, p_storage_path: storagePath,
  });
  if (completed.error || completed.data !== true)
    return NextResponse.json({ error: "Completion is pending retry." }, { status: 503, headers: RETRY_HEADERS });

  return NextResponse.json({ accepted: true });
}
