import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { packProgress } from "@/lib/ad-variant-packs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { supabase, user, response } = await requireUser(); if (!user) return response;
  const { id } = await context.params;
  const { data, error } = await supabase.from("ad_variant_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de lire le Pack" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
  return NextResponse.json({ pack: data, progress: packProgress(data.checkpoints, data.status) });
}
