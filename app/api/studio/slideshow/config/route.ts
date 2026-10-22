import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isPreviewEnabled, publicTracks } from "@/lib/studio/slideshow-server";
import { slideshowVoiceAvailability } from "@/lib/studio/slideshow-voice";
export const runtime = "nodejs";
export async function GET() {
 const { user, response } = await requireUser(); if (!user) return response;
 const tracks = isPreviewEnabled() ? publicTracks() : [];
 return NextResponse.json({ enabled: isPreviewEnabled(), ...slideshowVoiceAvailability(), tracks, licensingNotice: tracks.length ? undefined : "Aucune piste n'est encore disponible : droits de synchronisation et de mise à disposition SaaS en cours de validation." }, { headers: { "Cache-Control": "no-store" } });
}
