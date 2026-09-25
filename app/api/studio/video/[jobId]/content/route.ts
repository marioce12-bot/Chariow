import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFalVideoUrl } from "@/lib/ai/fal";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;

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
