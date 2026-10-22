import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { syncShopifyStore } from "@/lib/shopify/sync";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    if (!storeId) return NextResponse.json({ error: "storeId requis" }, { status: 400 });
    const { data: store, error } = await auth.supabase.from("stores").select("id,user_id,store_name,connected_at,platform,is_active,connection_status").eq("id", storeId).eq("user_id", auth.user.id).eq("platform", "shopify").maybeSingle();
    if (error) throw error;
    if (!store || !store.is_active || store.connection_status !== "connected") return NextResponse.json({ error: "Boutique Shopify non connectée" }, { status: 404 });
    return NextResponse.json(await syncShopifyStore(store));
  } catch {
    return NextResponse.json({ error: "Échec de la synchronisation Shopify" }, { status: 502 });
  }
}
