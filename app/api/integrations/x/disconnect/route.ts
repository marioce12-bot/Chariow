import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { error } = await supabase.from("x_ads_integrations").update({ is_active: false, last_error: null }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Impossible de déconnecter X Ads" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
