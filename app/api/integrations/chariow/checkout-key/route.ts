import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  if (!storeId) return NextResponse.json({ error: "store_id requis" }, { status: 400 });
  const { data: store, error } = await supabase.from("stores").select("id,chariow_api_key_encrypted").eq("id", storeId).eq("user_id", user.id).eq("platform", "chariow").eq("is_active", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  return NextResponse.json({ configured: Boolean(store.chariow_api_key_encrypted) });
}

export async function PUT(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const storeId = typeof body?.store_id === "string" ? body.store_id : "";
  const apiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";
  if (!storeId || apiKey.length < 16 || apiKey.length > 512) return NextResponse.json({ error: "Clé API invalide" }, { status: 400 });
  const { error } = await supabase.from("stores").update({ chariow_api_key_encrypted: encryptSecret(apiKey) }).eq("id", storeId).eq("user_id", user.id).eq("platform", "chariow").eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const storeId = typeof body?.store_id === "string" ? body.store_id : "";
  if (!storeId) return NextResponse.json({ error: "store_id requis" }, { status: 400 });
  const { error } = await supabase.from("stores").update({ chariow_api_key_encrypted: null }).eq("id", storeId).eq("user_id", user.id).eq("platform", "chariow").eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
