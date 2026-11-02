import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedStudioUrl } from "@/lib/studio/media";

const MAX_WAIT_MS = 12 * 60_000;
const TIMEOUT_ERROR = "La génération a dépassé le délai normal et a été abandonnée.";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (!jobId || jobId.length > 512) {
    return NextResponse.json({ error: "Identifiant de tâche invalide." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const admin = createAdminClient();
  const { data: generation, error } = await admin
    .from("studio_generations")
    .select("id,status,storage_path,credit_transaction_id,created_at,error")
    .eq("user_id", user.id)
    .eq("video_job_id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Suivi indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!generation) return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

  let status = generation.status;
  let savedError = generation.error;
  let storagePath = generation.storage_path;
  if (status === "processing" && Date.now() - new Date(generation.created_at).getTime() > MAX_WAIT_MS) {
    const { data: changed, error: updateError } = await admin.rpc("fail_stale_studio_video_generation", {
      p_generation_id: generation.id,
      p_created_before: new Date(Date.now() - MAX_WAIT_MS).toISOString(),
      p_error: TIMEOUT_ERROR,
    });
    if (updateError) return NextResponse.json({ error: "Mise à jour du délai indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    if (changed === true) {
      status = "failed";
      savedError = TIMEOUT_ERROR;
    } else {
      const latest = await admin.from("studio_generations")
        .select("status,error,storage_path")
        .eq("id", generation.id).eq("user_id", user.id).maybeSingle();
      if (latest.error) return NextResponse.json({ error: "État de génération indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      status = latest.data?.status ?? status;
      savedError = latest.data?.error ?? savedError;
      storagePath = latest.data?.storage_path ?? storagePath;
    }
  }

  // Compensation is retried on later reads if an earlier RPC failed after the
  // terminal timeout state was saved; this avoids silently stranding credits.
  if (status === "failed" && savedError === TIMEOUT_ERROR) {
    if (generation.credit_transaction_id) {
      const refund = await admin.rpc("refund_credit_debit", { transaction_id: generation.credit_transaction_id });
      if (refund.error) return NextResponse.json({ error: "Remboursement en attente de reprise." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    const release = await admin.rpc("release_video_slot", { p_user_id: user.id, p_request_id: generation.id });
    if (release.error) return NextResponse.json({ error: "Libération du quota en attente de reprise." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  const contentUrl = status === "completed" && storagePath
    ? await signedStudioUrl(storagePath, user.id).catch(() => null)
    : null;
  return NextResponse.json({ id: jobId, status, contentUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
