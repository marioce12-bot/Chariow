import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("tiktok_ad_accounts").select("id,tiktok_advertiser_id,name,currency,status").eq("user_id", user.id).eq("is_active", true);
  if (error) return NextResponse.json({ error: "Impossible de charger les comptes TikTok Ads" }, { status: 500 });
  return NextResponse.json({ accounts: (data ?? []).map((row) => ({ id: row.id, advertiser_id: row.tiktok_advertiser_id, name: row.name, currency: row.currency, status: row.status })) });
}
