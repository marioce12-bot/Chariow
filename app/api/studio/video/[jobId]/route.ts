import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFalVideo, getFalVideoJob } from "@/lib/ai/fal";
import { signedStudioUrl, storeStudioVideo } from "@/lib/studio/media";

const MAX_WAIT_MS = 12 * 60_000;

const COMPLETED_STATUSES = new Set(["completed", "complete", "succeeded", "success", "finished", "done"]);
const FAILED_STATUSES = new Set(["failed", "fail", "error", "errored", "cancelled", "canceled", "canceling", "cancelling", "expired", "timeout", "timed_out"]);

function normalize(status: string) {
  return status.trim().toLowerCase();
}

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });

  const admin = createAdminClient();

  try {
    const job = await getFalVideoJob(jobId);
    const rawStatus = normalize(job.status);
    const { data: generation } = await admin
      .from("studio_generations")
      .select("id,status,storage_path,credit_transaction_id,created_at")
      .eq("user_id", user.id)
      .eq("video_job_id", jobId)
      .maybeSingle();

    let effectiveStatus: string = job.status;
    let storagePath = generation?.storage_path ?? null;
    const transactionId = generation?.credit_transaction_id ?? null;

    if (generation && COMPLETED_STATUSES.has(rawStatus)) {
      // Vidéo générée : on débite définitivement les crédits (réservation → complété).
      if (transactionId) {
        try { await admin.rpc("complete_credit_debit", { transaction_id: transactionId }); } catch { /* non bloquant */ }
      }

      if (!storagePath) {
        // Stockage Vendeo pas encore fait : on tente de télécharger + stocker.
        // En cas d'échec on reste "processing" (nouvel essai au prochain poll) et
        // l'URL temporaire fal reste accessible via /content.
        try {
          const video = await downloadFalVideo(jobId);
          storagePath = await storeStudioVideo(video, user.id, generation.id);
          await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, error: null }).eq("id", generation.id);
          effectiveStatus = "completed";
        } catch (storageError) {
          console.error("Studio video storage error", storageError instanceof Error ? storageError.message : storageError);
        }
      } else {
        effectiveStatus = "completed";
      }
    } else if (generation && FAILED_STATUSES.has(rawStatus)) {
      // Échec réel : on rembourse la réservation et on marque l'échec.
      if (transactionId) {
        try { await admin.rpc("refund_credit_debit", { transaction_id: transactionId }); } catch { /* non bloquant */ }
      }
      effectiveStatus = "failed";
      await admin.from("studio_generations").update({ status: "failed", error: `Statut vidéo : ${job.status}` }).eq("id", generation.id);
    } else if (generation && generation.status === "processing" && Date.now() - new Date(generation.created_at).getTime() > MAX_WAIT_MS) {
      // Bloqué sans résultat : on rembourse la réservation et on abandonne proprement.
      if (transactionId) {
        try { await admin.rpc("refund_credit_debit", { transaction_id: transactionId }); } catch { /* non bloquant */ }
      }
      effectiveStatus = "failed";
      await admin.from("studio_generations").update({ status: "failed", error: "La génération a dépassé le délai normal et a été abandonnée." }).eq("id", generation.id);
    }

    const contentUrl = storagePath ? await signedStudioUrl(storagePath).catch(() => null) : `/api/studio/video/${encodeURIComponent(jobId)}/content`;
    return NextResponse.json({ ...job, status: effectiveStatus, contentUrl: effectiveStatus === "completed" ? contentUrl : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de suivi vidéo.";
    console.error("fal.ai studio video status error", message);
    return NextResponse.json({ error: "Impossible de suivre la génération vidéo." }, { status: 502 });
  }
}
