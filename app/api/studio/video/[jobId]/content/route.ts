import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedStudioUrl } from "@/lib/studio/media";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { jobId } = await params;
  if (!jobId || jobId.length > 512) return NextResponse.json({ error: "Identifiant de tâche invalide." }, { status: 400 });

  const { data: generation, error } = await createAdminClient().from("studio_generations")
    .select("status,storage_path")
    .eq("user_id", user.id)
    .eq("video_job_id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Vidéo indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!generation) return NextResponse.json({ error: "Tâche vidéo introuvable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (generation.status !== "completed" || !generation.storage_path)
    return NextResponse.json({ error: "Le média vidéo n'est pas encore disponible." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

  try {
    const contentUrl = await signedStudioUrl(generation.storage_path, user.id);
    return NextResponse.redirect(contentUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Vidéo indisponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
