import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { downloadFalVideo, getFalVideoJob } from "@/lib/ai/fal";
import { signedStudioUrl, storeStudioVideo } from "@/lib/studio/media";

// Au-delà de cette attente, on considère la génération comme bloquée côté
// fal.ai plutôt que de laisser l'utilisateur face à un statut "processing" qui
// ne bouge plus jamais (cas remonté : plus de 30 minutes sans résultat, y
// compris après avoir quitté puis rouvert l'application). Une vidéo de 40 s
// maximum ne devrait jamais légitimement prendre autant de temps.
const MAX_WAIT_MS = 12 * 60_000;

// Les valeurs de statut ci-dessous couvrent les intitulés vus en pratique
// (et leurs variantes probables) pour éviter qu'un statut terminal non
// reconnu tel quel (ex. "succeeded" au lieu de "completed", "error" au lieu
// de "failed") ne laisse la génération bloquée indéfiniment en "processing"
// côté Vendeo alors que fal.ai a déjà terminé ou abandonné le job.
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

  try {
    const job = await getFalVideoJob(jobId);
    const rawStatus = normalize(job.status);
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data: generation } = await admin.from("studio_generations").select("id,status,storage_path,created_at").eq("user_id", user.id).eq("video_job_id", jobId).maybeSingle();

    let effectiveStatus: string = job.status;
    let storagePath = generation?.storage_path ?? null;

    if (generation && COMPLETED_STATUSES.has(rawStatus) && !storagePath) {
      try {
        const video = await downloadFalVideo(jobId);
        storagePath = await storeStudioVideo(video, user.id, generation.id);
        await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, error: null }).eq("id", generation.id);
        effectiveStatus = "completed";
      } catch (storageError) {
        console.error("Studio video storage error", storageError instanceof Error ? storageError.message : storageError);
      }
    } else if (generation && COMPLETED_STATUSES.has(rawStatus)) {
      effectiveStatus = "completed";
    } else if (generation && FAILED_STATUSES.has(rawStatus)) {
      effectiveStatus = "failed";
      await admin.from("studio_generations").update({ status: "failed", error: `Statut vidéo : ${job.status}` }).eq("id", generation.id);
    } else if (generation && generation.status === "processing" && Date.now() - new Date(generation.created_at).getTime() > MAX_WAIT_MS) {
      // Ni terminé ni explicitement échoué après un délai déraisonnable : on
      // arrête d'attendre indéfiniment plutôt que de laisser l'utilisateur
      // face à "processing" sans fin. Remarque : les crédits de cette
      // génération ont déjà été débités à la création du job (avant même de
      // savoir si la vidéo aboutirait) ; ce blocage ne déclenche pas de
      // remboursement automatique aujourd'hui.
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
