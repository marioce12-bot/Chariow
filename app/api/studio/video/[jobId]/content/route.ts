import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedStudioUrl } from "@/lib/studio/media";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (!UUID.test(jobId)) return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404 });

  const { data: row, error } = await createAdminClient()
    .from("studio_generations")
    .select("status,storage_path")
    .eq("user_id", user.id)
    .eq("video_job_id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Le téléchargement vidéo est temporairement indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!row) return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404 });
  if (row.status !== "completed" || !row.storage_path) return NextResponse.json({ error: "La vidéo n’est pas encore prête." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  try {
    const url = await signedStudioUrl(row.storage_path);
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "La vidéo terminée est momentanément indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
