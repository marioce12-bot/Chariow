import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot } from "@/lib/chariow/analytics";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const { data: store, error } = await supabase.from("stores").select("id, mcp_url, access_token_encrypted, store_name, platform").eq("id", id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  try {
    const snapshot = await getChariowSnapshot(store);
    return NextResponse.json({ ok: true, store_name: store.store_name, has_store_data: Boolean(snapshot.store), has_products: Boolean(snapshot.products), has_analytics: Boolean(snapshot.salesAnalytics) });
  } catch (testError) {
    console.error("Chariow connection test error", testError instanceof Error ? testError.message : testError);
    return NextResponse.json({ error: "La connexion MCP Chariow n’a pas pu être vérifiée. Réautorise l’accès depuis Chariow puis réessaie." }, { status: 502 });
  }
}
