import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim() || null;
  if (typeof body.ad_text === "string" && body.ad_text.trim()) updates.ad_text = body.ad_text.trim();
  if (typeof body.destination_url === "string" && body.destination_url.trim()) updates.destination_url = body.destination_url.trim();
  if (typeof body.media_url === "string") updates.media_url = body.media_url.trim() || null;
  if (Array.isArray(body.countries)) updates.countries = body.countries.filter((country): country is string => typeof country === "string" && country.length > 0);
  if (Number.isInteger(body.min_age) && Number(body.min_age) >= 13) updates.min_age = Number(body.min_age);
  if (Number.isInteger(body.max_age) && Number(body.max_age) >= 13) updates.max_age = Number(body.max_age);
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Aucune modification" }, { status: 400 });

  const { data, error } = await supabase.from("ad_campaigns").update(updates).eq("id", id).eq("user_id", user.id).select("id,status,external_error").maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de modifier la campagne" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  return NextResponse.json({ campaign: data });
}
