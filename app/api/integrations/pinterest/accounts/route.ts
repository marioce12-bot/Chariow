import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("pinterest_ad_accounts").select("id,pinterest_ad_account_id,name,currency,country").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de charger les comptes Pinterest Ads" }, { status: 500 });
  return NextResponse.json({ accounts: (data ?? []).map((row) => ({ id: row.id, advertiser_id: row.pinterest_ad_account_id, name: row.name, currency: row.currency, country: row.country })) });
}
