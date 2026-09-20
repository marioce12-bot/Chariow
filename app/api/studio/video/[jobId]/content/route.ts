import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { jobId } = await params;
  const apiKey = process.env.IMOLE_API_KEY;
  const baseUrl = (process.env.IMOLE_API_URL || "https://api.imole.app/v1").replace(/\/$/, "");
  if (!apiKey) return NextResponse.json({ error: "Le studio n'est pas configuré." }, { status: 503 });

  const upstream = await fetch(`${baseUrl}/media/jobs/${encodeURIComponent(jobId)}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!upstream.ok) return NextResponse.json({ error: "Le média vidéo n'est pas encore disponible." }, { status: upstream.status });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "video/mp4",
      "Cache-Control": "private, max-age=300",
    },
  });
}
