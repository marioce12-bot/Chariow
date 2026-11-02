import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedStudioUrl } from "@/lib/studio/media";
import { findStudioVideoRowForUser, isStudioVideoTaskReference } from "@/lib/studio/video-job-reference";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (!jobId || jobId.length > 256 || !isStudioVideoTaskReference(jobId)) {
    return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404 });
  }

  const { data: row, error } = await findStudioVideoRowForUser(
    createAdminClient(),
    user.id,
    jobId,
    "id,video_job_id,status,storage_path,metadata",
  );
  if (error) return NextResponse.json({ error: "Le téléchargement vidéo est temporairement indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!row) return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404 });
  if (row.status !== "completed" || !row.storage_path) return NextResponse.json({ error: "La vidéo n’est pas encore prête." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  try {
    const contentUrl = await signedStudioUrl(row.storage_path, user.id);
    return NextResponse.redirect(contentUrl, { status: 307, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Vidéo indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
