import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body?.visitorId) return NextResponse.json({ error: "visitorId requis" }, { status: 400 });
  const { data: store } = await supabase.from("stores").select("id").eq("user_id", user.id).eq("is_active", true).eq("platform", "chariow").limit(1).maybeSingle();
  const { error } = await supabase.from("attribution_touches").upsert({ user_id: user.id, store_id: store?.id ?? null, visitor_id: String(body.visitorId), utm_source: body.utmSource ?? null, utm_medium: body.utmMedium ?? null, utm_campaign: body.utmCampaign ?? null, utm_content: body.utmContent ?? null, utm_term: body.utmTerm ?? null, fbclid: body.fbclid ?? null, landing_url: body.landingUrl ?? null, captured_at: body.capturedAt ?? new Date().toISOString() }, { onConflict: "user_id,visitor_id" });
  if (error) return NextResponse.json({ error: "Impossible d’enregistrer le suivi" }, { status: 500 });
  return NextResponse.json({ received: true });
}
