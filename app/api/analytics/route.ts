import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot } from "@/lib/chariow/analytics";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const storeId = new URL(request.url).searchParams.get("store_id");
  const query = supabase.from("stores").select("id, store_name, mcp_url, access_token_encrypted").eq("user_id", user.id).eq("is_active", true);
  const { data: store, error } = await (storeId ? query.eq("id", storeId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Aucune boutique active" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store);
    return NextResponse.json({ store: { id: store.id, name: store.store_name }, snapshot });
  } catch (analyticsError) {
    console.error("Chariow analytics error", analyticsError instanceof Error ? analyticsError.message : analyticsError);
    return NextResponse.json({ error: "Les données Chariow sont momentanément indisponibles" }, { status: 502 });
  }
}
