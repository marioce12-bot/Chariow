import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data: integration, error: integrationError } = await supabase.from("x_ads_integrations").select("id,last_error").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (integrationError) return NextResponse.json({ error: "Impossible de charger la connexion X Ads" }, { status: 500 });
  const { data, error } = await supabase.from("x_ads_accounts").select("id,x_account_id,name,currency,timezone,approval_status").eq("user_id", user.id).eq("is_active", true).order("name");
  if (error) return NextResponse.json({ error: "Impossible de charger les comptes X Ads" }, { status: 500 });
  return NextResponse.json({ connected: Boolean(integration), connectionError: integration?.last_error ?? null, accounts: data ?? [] });
}
