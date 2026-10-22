import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getShopifyConfigStatus } from "@/lib/shopify/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const status = getShopifyConfigStatus();
  const { data: stores, error } = await supabase.from("stores").select("id,store_name,shop_domain,connection_status,connected_at,is_active").eq("user_id", user.id).eq("platform", "shopify").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Impossible de lire les boutiques Shopify" }, { status: 500 });
  return NextResponse.json({ ...status, stores: stores ?? [] });
}
