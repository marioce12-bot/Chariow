import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot, normalizeChariowSnapshot } from "@/lib/chariow/analytics";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  const from = new URL(request.url).searchParams.get("from") ?? undefined;
  const to = new URL(request.url).searchParams.get("to") ?? undefined;
  const query = supabase.from("stores").select("id, store_name, mcp_url, access_token_encrypted, connection_status").eq("user_id", user.id).eq("is_active", true);
  const { data: store, error } = await (storeId ? query.eq("id", storeId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Aucune boutique active" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store, { from, to });
    const normalized = normalizeChariowSnapshot(snapshot, { from: from ?? "", to: to ?? "" });
    return NextResponse.json({ store: { name: normalized.storeName, status: store.connection_status }, snapshot: normalized });
  } catch (analyticsError) {
    const message = analyticsError instanceof Error ? analyticsError.message : String(analyticsError);
    console.error("Chariow analytics error", message);
    if (message.includes("401")) {
      await supabase.from("stores").update({ connection_status: "expired", connection_error: null, last_verified_at: new Date().toISOString() }).eq("id", store.id).eq("user_id", user.id);
      return NextResponse.json({ error: "La connexion Chariow a expiré" }, { status: 401 });
    }
    return NextResponse.json({ error: "Les données Chariow sont momentanément indisponibles" }, { status: 502 });
  }
}
