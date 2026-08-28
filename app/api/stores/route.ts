import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChariowSnapshot } from "@/lib/chariow/analytics";

const platforms = ["chariow", "selar", "gumroad"] as const;

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase
    .from("stores")
    .select("id, platform, store_name, mcp_url, is_active, connection_status, connection_error, connected_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stores: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const { platform, store_name, mcp_url } = body ?? {};
  // MVP Chariow: pas de token séparé à copier; l'URL MCP complète doit suffire.
  if (!platforms.includes(platform) || !store_name?.trim() || !mcp_url) {
    return NextResponse.json({ error: "platform, store_name et une URL MCP sont requis" }, { status: 400 });
  }
  if (mcp_url && !String(mcp_url).startsWith("https://")) return NextResponse.json({ error: "L'URL MCP doit utiliser HTTPS" }, { status: 400 });
  const { count } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true);
  const { data: subscription } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).single();
  const maxStores = subscription?.plan === "pro" ? 3 : 1;
  if ((count ?? 0) >= maxStores) return NextResponse.json({ error: `Ton plan autorise ${maxStores} boutique(s)` }, { status: 403 });
  const { data, error } = await supabase
    .from("stores")
    .insert({
      user_id: user.id,
      platform,
      store_name: store_name.trim(),
      mcp_url: mcp_url || null,
      // Ne stocke rien côté token pour le MVP Chariow.
      access_token_encrypted: null,
      connection_status: "pending",
    })
    .select("id, platform, store_name, mcp_url, connection_status, is_active, connected_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Vérification MCP réelle avant de marquer comme connecté.
  try {
    const snapshot = await getChariowSnapshot({
      mcp_url: data.mcp_url,
      access_token_encrypted: null,
    });
    void snapshot; // snapshot sert uniquement à valider l'accès.

    const { error: upError } = await supabase
      .from("stores")
      .update({ connection_status: "connected", connection_error: null, connected_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

    const { data: updated } = await supabase
      .from("stores")
      .select("id, platform, store_name, mcp_url, connection_status, connection_error, is_active, connected_at")
      .eq("id", data.id)
      .single();
    return NextResponse.json({ store: updated }, { status: 201 });
  } catch (testError) {
    const message = testError instanceof Error ? testError.message : "Echec de connexion MCP";
    const { error: upError } = await supabase
      .from("stores")
      .update({ connection_status: "failed", connection_error: message })
      .eq("id", data.id);
    if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

    const { data: updated } = await supabase
      .from("stores")
      .select("id, platform, store_name, mcp_url, connection_status, connection_error, is_active, connected_at")
      .eq("id", data.id)
      .single();
    return NextResponse.json({ store: updated }, { status: 201 });
  }
}
