import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFalVideo, getFalVideoJob } from "@/lib/ai/fal";
import { signedStudioUrl, storeStudioVideo } from "@/lib/studio/media";

const MAX_WAIT_MS = 30 * 60_000;

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });

  const admin = createAdminClient();
  const { data: generation, error: lookupError } = await admin.from("studio_generations")
    .select("id,status,storage_path,credit_transaction_id,created_at,metadata")
    .eq("user_id", user.id).eq("video_job_id", jobId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Le suivi vidéo est temporairement indisponible." }, { status: 503 });
  if (!generation) return NextResponse.json({ error: "Génération introuvable." }, { status: 404 });
  if (generation.status === "failed") return NextResponse.json({ id: jobId, status: "failed", contentUrl: null });

  const transactionId = generation.credit_transaction_id as string | null;
  const finalizeCredits = async () => {
    if (!transactionId) return true;
    const { data, error } = await admin.rpc("complete_credit_debit", { transaction_id: transactionId });
    return !error && data === true;
  };
  const content = async (path: string | null) => path ? await signedStudioUrl(path).catch(() => null) : null;
  if (generation.storage_path) {
    const debited = await finalizeCredits();
    const contentUrl = await content(generation.storage_path);
    if (!contentUrl) return NextResponse.json({ id: jobId, status: "processing", contentUrl: null }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ id: jobId, status: "completed", contentUrl, ...(debited ? {} : { billingPending: true }) });
  }

  try {
    const job = await getFalVideoJob(jobId);
    const ageMs = Date.now() - Date.parse(generation.created_at);
    if (job.status === "failed" || (job.status === "processing" && ageMs > MAX_WAIT_MS)) {
      if (transactionId) await admin.rpc("refund_credit_debit", { transaction_id: transactionId });
      await admin.from("studio_generations").update({ status: "failed", error: job.status === "failed" ? "La génération fournisseur a échoué." : "La génération a dépassé le délai normal." }).eq("id", generation.id).eq("user_id", user.id);
      return NextResponse.json({ id: jobId, status: "failed", contentUrl: null });
    }
    if (job.status !== "completed") return NextResponse.json({ ...job, contentUrl: null }, { headers: { "Cache-Control": "no-store" } });

    try {
      const video = await downloadFalVideo(jobId);
      const storagePath = await storeStudioVideo(video, user.id, generation.id);
      const saved = await admin.from("studio_generations").update({ status: "completed", storage_path: storagePath, error: null }).eq("id", generation.id).eq("user_id", user.id);
      if (saved.error) throw saved.error;
      const debited = await finalizeCredits();
      const contentUrl = await content(storagePath);
      if (!contentUrl) return NextResponse.json({ id: jobId, status: "processing", contentUrl: null }, { headers: { "Cache-Control": "no-store" } });
      return NextResponse.json({ id: jobId, status: "completed", contentUrl, ...(debited ? {} : { billingPending: true }) });
    } catch (storageError) {
      console.error("Studio video finalization error", storageError instanceof Error ? storageError.message : "storage failure");
      return NextResponse.json({ id: jobId, status: "processing", contentUrl: null, message: "Vidéo prête, enregistrement final en cours." }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("Fal video status check failed", error instanceof Error ? error.message : "provider status failure");
    if (Date.now() - Date.parse(generation.created_at) > MAX_WAIT_MS) {
      if (transactionId) await admin.rpc("refund_credit_debit", { transaction_id: transactionId });
      await admin.from("studio_generations").update({ status: "failed", error: "Le suivi fournisseur a dépassé le délai normal." }).eq("id", generation.id).eq("user_id", user.id);
      return NextResponse.json({ id: jobId, status: "failed", contentUrl: null });
    }
    return NextResponse.json({ error: "Impossible de suivre la génération vidéo." }, { status: 502 });
  }
}
