import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { isPreviewEnabled, makeMusicPreview } from "@/lib/studio/slideshow-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const { user, response } = await requireUser(); if (!user) return response;
 if (!isPreviewEnabled()) return NextResponse.json({ error: "Disponible uniquement en prévisualisation." }, { status: 404 });
 if (rateLimit(`music-preview:${user.id}`, 15)) return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });
 const { id } = await params;
 try { const video = await makeMusicPreview(id); return new NextResponse(new Uint8Array(video), { headers: { "Content-Type": "video/mp4", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
 catch (error) { const msg = error instanceof Error ? error.message : "Aperçu indisponible."; console.error("studio music preview:", msg); return NextResponse.json({ error: "Piste indisponible." }, { status: 404 }); }
}
