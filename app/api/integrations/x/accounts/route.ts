import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("x_ads_accounts").select("id,x_account_id,name,currency,timezone,approval_status").eq("user_id", user.id).eq("is_active", true).order("name");
  if (error) return NextResponse.json({ error: "Impossible de charger les comptes X Ads" }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}
