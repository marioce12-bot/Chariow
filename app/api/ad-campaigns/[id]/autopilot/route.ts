import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

// Active/désactive le pilotage automatique d'une campagne. Quand il est activé,
// le cron /api/cron/autopilot évalue périodiquement la rentabilité de la
// campagne et peut la mettre en pause automatiquement (avec motif).
export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Indique enabled (true/false)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_campaigns")
    .update({ autopilot_enabled: body.enabled })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,autopilot_enabled")
    .single();
  if (error) return NextResponse.json({ error: "Impossible de modifier le pilotage automatique" }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
