import { NextResponse } from "next/server";
import { searchCommonsMusic } from "@/lib/studio/music-catalog";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (rateLimit(`studio-music:${user.id}`, 20)) return NextResponse.json({ error: "Trop de recherches. Réessaie dans une minute." }, { status: 429 });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length > 100) return NextResponse.json({ error: "Query too long" }, { status: 400 });
  try {
    const tracks = await searchCommonsMusic(query);
    return NextResponse.json({ tracks }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "Music catalogue temporarily unavailable" }, { status: 502 });
  }
}
