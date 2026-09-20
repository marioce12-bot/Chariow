import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getImoleVideoJob } from "@/lib/ai/imole";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });

  try {
    const job = await getImoleVideoJob(jobId);
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data: generation } = await admin.from("studio_generations").select("id,status").eq("user_id", user.id).eq("video_job_id", jobId).maybeSingle();
    if (generation && ["completed", "failed"].includes(job.status)) await admin.from("studio_generations").update({ status: job.status === "completed" ? "completed" : "failed", error: job.status === "completed" ? null : `Statut vidéo : ${job.status}` }).eq("id", generation.id);
    const contentUrl = `/api/studio/video/${encodeURIComponent(jobId)}/content`;
    return NextResponse.json({ ...job, contentUrl: job.status === "completed" ? contentUrl : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de suivi vidéo.";
    console.error("Imole studio video status error", message);
    return NextResponse.json({ error: "Impossible de suivre la génération vidéo." }, { status: 502 });
  }
}
