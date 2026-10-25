import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_SECTIONS = new Set([
  "Vue d'ensemble", "Vendeo AI", "Studio", "Pub", "Comptes publicitaires",
  "Radar marché", "Performance visuel", "Performance publicitaire", "Mes boutiques", "Rapports", "Abonnement",
  "Paramètres", "Notifications", "Bénéfices nets", "Relances WhatsApp",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type TrackBody = { session_id?: unknown; section?: unknown; seconds?: unknown; new_visit?: unknown };

export async function POST(request: Request) {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;

  const body = (await request.json().catch(() => null)) as TrackBody | null;
  if (!body || typeof body.session_id !== "string" || !UUID_RE.test(body.session_id)
    || typeof body.section !== "string" || !ALLOWED_SECTIONS.has(body.section)
    || typeof body.seconds !== "number" || !Number.isFinite(body.seconds)
    || body.seconds < 0 || body.seconds > 60 || typeof body.new_visit !== "boolean") {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  // Le RPC autorise les sections canoniques. Les deux vues de performance sont des sous-sections de Pub.
  const section = body.section === "Performance publicitaire" || body.section === "Performance visuel" ? "Pub" : body.section;
  // Identité issue uniquement de la session authentifiée ; la clé admin reste serveur.
  const { error } = await createAdminClient().rpc("track_usage_heartbeat", {
    p_user_id: user.id,
    p_session_id: body.session_id,
    p_section: section,
    p_seconds: Math.floor(body.seconds),
    p_new_visit: body.new_visit,
  });
  if (error) {
    console.error("track_usage_heartbeat failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Échec de l'enregistrement du suivi" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
