import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { downloadImoleVideo, getImoleVideoJob } from "@/lib/ai/imole";
import { signedStudioUrl, storeStudioVideo } from "@/lib/studio/media";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });

  try {
    const job = await getImoleVideoJob(jobId);
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data: generation } = await admin.from("studio_generations").select("id,status,storage_path").eq("user_id", user.id).eq("video_job_id", jobId).maybeSingle();
    let storagePath = generation?.storage_path ?? null;
    if (generation && job.status === "completed" && !storagePath) {
      try {
        const video = await downloadImoleVideo(jobId);
        storagePath = await storeStudioVideo(video, user.id, generation.id);
        await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, error: null }).eq("id", generation.id);
      } catch (storageError) {
        console.error("Studio video storage error", storageError instanceof Error ? storageError.message : storageError);
      }
    } else if (generation && ["completed", "failed"].includes(job.status)) {
      await admin.from("studio_generations").update({ status: job.status === "completed" ? "completed" : "failed", error: job.status === "completed" ? null : `Statut vidéo : ${job.status}` }).eq("id", generation.id);
    }
    const contentUrl = storagePath ? await signedStudioUrl(storagePath).catch(() => null) : `/api/studio/video/${encodeURIComponent(jobId)}/content`;
    return NextResponse.json({ ...job, contentUrl: job.status === "completed" ? contentUrl : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de suivi vidéo.";
    console.error("Imole studio video status error", message);
    return NextResponse.json({ error: "Impossible de suivre la génération vidéo." }, { status: 502 });
  }
}
