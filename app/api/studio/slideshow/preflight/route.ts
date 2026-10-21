import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { isPreviewEnabled, preflightSlideshow } from "@/lib/studio/slideshow-server";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  const { user, response } = await requireUser(); if (!user) return response;
  if (!isPreviewEnabled()) return NextResponse.json({ error: "Diaporama indisponible dans cet environnement." }, { status: 404 });
  if (rateLimit(`slideshow-preflight:${user.id}`, 10)) return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.musicId !== "string" || (body.musicId !== "" && !/^[a-zA-Z0-9_-]{1,80}$/.test(body.musicId))) return NextResponse.json({ error: "Musique invalide." }, { status: 400 });
  try { await preflightSlideshow(body.musicId); return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("slideshow preflight", error instanceof Error ? error.message : "Unknown error"); return NextResponse.json({ error: "Le moteur ou cette musique n’est pas disponible. Aucune image n’a été générée." }, { status: 503 }); }
}
