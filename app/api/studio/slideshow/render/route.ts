import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { isPreviewEnabled } from "@/lib/studio/slideshow-server";
import { publicSlideshowError } from "@/lib/studio/slideshow-errors";
import { MAX_SLIDESHOW_IMAGES, MIN_SLIDESHOW_IMAGES, SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
 const { user, response } = await requireUser(); if (!user) return response;
 if (!isPreviewEnabled()) return NextResponse.json({ error: "Diaporama indisponible dans cet environnement." }, { status: 404 });
 if (rateLimit(`slideshow-render:${user.id}`, 4)) return NextResponse.json({ error: "Trop de demandes. Patiente une minute." }, { status: 429 });
 let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
 if (!body || typeof body !== "object" || !Array.isArray(body.generationIds) || body.generationIds.length < MIN_SLIDESHOW_IMAGES || body.generationIds.length > MAX_SLIDESHOW_IMAGES || body.generationIds.some((id: unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) || new Set(body.generationIds).size !== body.generationIds.length || !(SLIDESHOW_DURATIONS as readonly number[]).includes(body.duration) || typeof body.musicId !== "string" || (body.musicId !== "" && !/^[a-zA-Z0-9_-]{1,80}$/.test(body.musicId))) return NextResponse.json({ error: "Paramètres de diaporama invalides." }, { status: 400 });
 return NextResponse.json({ code: "SLIDESHOW_VOICE_REQUIRED", error: publicSlideshowError(null, body?.locale, "SLIDESHOW_VOICE_REQUIRED") }, { status: 409 });
}
