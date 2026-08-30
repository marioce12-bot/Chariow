import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { error } = await supabase.from("meta_ad_accounts").update({ is_active: false, is_selected: false }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Impossible de déconnecter Meta Ads" }, { status: 500 });
  await supabase.from("meta_integrations").update({ is_active: false, last_error: null }).eq("user_id", user.id);
  return NextResponse.json({ disconnected: true });
}
