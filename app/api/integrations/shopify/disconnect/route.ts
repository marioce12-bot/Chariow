import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (typeof body?.store_id !== "string") return NextResponse.json({ error: "store_id requis" }, { status: 400 });
  const { data: store, error: findError } = await supabase.from("stores").select("id").eq("id", body.store_id).eq("user_id", user.id).eq("platform", "shopify").maybeSingle();
  if (findError) return NextResponse.json({ error: "Impossible de vérifier la boutique" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Boutique Shopify introuvable" }, { status: 404 });
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("shopify_connections").delete().eq("store_id", store.id).eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: "Impossible de supprimer les identifiants Shopify" }, { status: 500 });
  const { data, error } = await supabase.from("stores").update({ connection_status: "revoked", connection_error: null, access_token_encrypted: null, refresh_token_encrypted: null, mcp_url: null }).eq("id", store.id).eq("user_id", user.id).select("id, platform, store_name, shop_domain, mcp_url, is_active, connection_status, created_at").single();
  if (error) return NextResponse.json({ error: "Impossible de déconnecter la boutique" }, { status: 500 });
  return NextResponse.json({ store: data });
}
