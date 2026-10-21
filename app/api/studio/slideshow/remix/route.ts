import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { isPreviewEnabled, remixSlideshow } from "@/lib/studio/slideshow-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
 const { user, response } = await requireUser(); if (!user) return response;
 if (!isPreviewEnabled()) return NextResponse.json({ error: "Disponible uniquement en prévisualisation." }, { status: 404 });
 if (rateLimit(`slideshow-remix:${user.id}`, 10)) return NextResponse.json({ error: "Trop de demandes. Patiente une minute." }, { status: 429 });
 let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
 if (!body || typeof body.generationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.generationId) || typeof body.musicId !== "string" || (body.musicId !== "" && !/^[a-zA-Z0-9_-]{1,80}$/.test(body.musicId))) return NextResponse.json({ error: "Paramètres de remix invalides." }, { status: 400 });
 try { return NextResponse.json(await remixSlideshow(user.id, body.generationId, body.musicId), { headers: { "Cache-Control": "no-store" } }); }
 catch (error) { const msg = error instanceof Error ? error.message : "Échec du remix."; const status = /unavailable|indisponible/i.test(msg) ? 404 : /exceeds|size limit/i.test(msg) ? 413 : 400; console.error("studio slideshow remix:", msg); return NextResponse.json({ error: msg }, { status }); }
}
