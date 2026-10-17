import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Sections de l'app suivies (mêmes libellés que l'état interne du Dashboard).
const ALLOWED_SECTIONS = new Set([
  "Vue d'ensemble",
  "Vendeo AI",
  "Studio",
  "Pub",
  "Comptes publicitaires",
  "Radar marché",
  "Mes boutiques",
  "Rapports",
  "Pilotage auto",
  "Abonnement",
  "Paramètres",
  "Notifications",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TrackBody = { session_id?: unknown; section?: unknown; seconds?: unknown; new_visit?: unknown };

export async function POST(request: Request) {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as TrackBody | null;
  if (!body || typeof body.session_id !== "string" || !UUID_RE.test(body.session_id) || typeof body.section !== "string" || !ALLOWED_SECTIONS.has(body.section)) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const seconds = Math.max(0, Math.min(60, Math.round(Number(body.seconds) || 0)));
  // user_id vient UNIQUEMENT de la session authentifiée, jamais de la requête.
  const { error } = await createAdminClient().rpc("track_usage_heartbeat", {
    p_user_id: user.id,
    p_session_id: body.session_id,
    p_section: body.section,
    p_seconds: seconds,
    p_new_visit: body.new_visit === true,
  });
  if (error) {
    console.error("track_usage_heartbeat failed", error.message);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
  return NextResponse.json({ ok: true });
}
