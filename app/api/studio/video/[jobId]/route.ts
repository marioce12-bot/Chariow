import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedStudioUrl } from "@/lib/studio/media";
import { confirmCreditTransition } from "@/lib/studio/credit-rpc";
import { findStudioVideoRowForUser, isStudioVideoTaskReference } from "@/lib/studio/video-job-reference";

export const runtime = "nodejs";
const STALE_AFTER_MS = 30 * 60 * 1000;

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (jobId.length > 256 || !isStudioVideoTaskReference(jobId)) return NextResponse.json({ error: "Tâche vidéo introuvable. Vérifie l’historique et les crédits avant toute nouvelle demande.", code: "STUDIO_VIDEO_TASK_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const admin = createAdminClient();
  const { data: row, error } = await findStudioVideoRowForUser(
    admin,
    user.id,
    jobId,
    "id,user_id,video_job_id,status,storage_path,metadata,credits_cost,credit_transaction_id,created_at,error",
  );
  if (error) return NextResponse.json({ error: "Le suivi vidéo est temporairement indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!row) return NextResponse.json({ error: "Tâche vidéo introuvable. Vérifie l’historique et les crédits avant toute nouvelle demande.", code: "STUDIO_VIDEO_TASK_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  let status = row.status as string;
  let metadata = (row.metadata ?? {}) as Record<string, any>;
  let creditState = typeof metadata.creditState === "string" ? metadata.creditState : undefined;
  if (row.credit_transaction_id) {
    const transaction = await admin
      .from("credit_transactions")
      .select("status")
      .eq("id", row.credit_transaction_id)
      .maybeSingle();
    if (!transaction.error) {
      if (transaction.data?.status === "pending") creditState = "reserved";
      else if (transaction.data?.status === "completed") creditState = "consumed";
      else if (transaction.data?.status === "refunded") creditState = "refunded";
    }
  }
  if (status === "processing") {
    const updatedAt = typeof metadata.updatedAt === "string" ? Date.parse(metadata.updatedAt) : NaN;
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_AFTER_MS) {
      const nextMetadata = {
        ...metadata,
        phase: "uncertain",
        creditState: "uncertain",
        errorCode: "STUDIO_VIDEO_STALE",
        userMessage: "Le suivi de cette génération est incertain. Les crédits restent réservés; ne relance pas la vidéo.",
        updatedAt: new Date().toISOString(),
      };
      const marked = await admin
        .from("studio_generations")
        .update({ status: "failed", error: nextMetadata.userMessage, metadata: nextMetadata })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .eq("status", "processing")
        .eq("metadata->>updatedAt", metadata.updatedAt)
        .select("id")
        .maybeSingle();
      if (marked.error) return NextResponse.json({ error: "Le suivi vidéo est temporairement indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      if (marked.data) { status = "failed"; metadata = nextMetadata; }
    }
  }

  if (status === "failed" && metadata.errorCode === "STUDIO_VIDEO_STALE") {
    if (row.credit_transaction_id) {
      const refundConfirmed = await confirmCreditTransition(admin, "refund_credit_debit", row.credit_transaction_id, { userId: user.id, amount: row.credits_cost });
      if (!refundConfirmed) return NextResponse.json({ error: "Remboursement en attente de reprise." }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
      creditState = "refunded";
      metadata = { ...metadata, creditState: "refunded", userMessage: "La vidéo a été arrêtée après un délai trop long. Les crédits ont été libérés." };
    }
    const release = await admin.rpc("release_video_slot", { p_user_id: user.id, p_request_id: row.id });
    if (release.error) return NextResponse.json({ error: "Libération du quota en attente de reprise." }, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
  }

  let contentUrl: string | null = null;
  if (status === "completed" && row.storage_path) {
    try { contentUrl = await signedStudioUrl(row.storage_path, user.id); }
    catch { return NextResponse.json({ error: "La vidéo terminée est momentanément indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  }
  let errorMessage = status === "failed" ? (metadata.userMessage ?? row.error ?? "La vidéo n’a pas pu être finalisée.") : undefined;
  if (status === "failed" && creditState === "refunded" && errorMessage) {
    errorMessage = errorMessage
      .replace(/crédits restent réservés/gi, "crédits ont été libérés")
      .replace(/credits remain reserved/gi, "credits were released");
  }
  return NextResponse.json({
    jobId: row.id,
    status,
    phase: metadata.phase ?? status,
    progress: Math.max(0, Math.min(100, Number(metadata.progress) || (status === "completed" ? 100 : 0))),
    cost: row.credits_cost,
    creditState,
    contentUrl,
    error: errorMessage,
    errorCode: typeof metadata.errorCode === "string" ? metadata.errorCode : null,
    createdAt: row.created_at,
  }, { headers: { "Cache-Control": "no-store" } });
}
