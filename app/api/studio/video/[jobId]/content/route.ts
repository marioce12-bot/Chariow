import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFalVideoUrl } from "@/lib/ai/fal";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;

  const { data: generation, error } = await createAdminClient().from("studio_generations")
    .select("id,status").eq("user_id", user.id).eq("video_job_id", jobId).maybeSingle();
  if (error) return NextResponse.json({ error: "Le média n’est pas disponible pour le moment." }, { status: 503 });
  if (!generation || generation.status !== "completed") return NextResponse.json({ error: "Le média vidéo n’est pas encore disponible." }, { status: 404 });

  try {
    const videoUrl = await getFalVideoUrl(jobId);
    const upstream = await fetch(videoUrl, { cache: "no-store" });
    if (!upstream.ok) return NextResponse.json({ error: "Le média vidéo n'est pas encore disponible." }, { status: upstream.status });

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("fal.ai video content error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le média vidéo n'est pas encore disponible." }, { status: 502 });
  }
}
