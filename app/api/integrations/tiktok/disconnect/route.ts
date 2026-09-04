import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  await supabase.from("tiktok_ad_accounts").update({ is_active: false }).eq("user_id", user.id);
  const { error } = await supabase.from("tiktok_integrations").update({ is_active: false }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Déconnexion impossible" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
