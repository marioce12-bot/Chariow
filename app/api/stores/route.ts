import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

const platforms = ["chariow", "selar", "gumroad"] as const;

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("stores").select("id, platform, store_name, mcp_url, is_active, connected_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stores: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const { platform, store_name, mcp_url, access_token } = body ?? {};
  if (!platforms.includes(platform) || !store_name?.trim() || (!mcp_url && !access_token)) return NextResponse.json({ error: "platform, store_name et une URL MCP ou clé d'accès sont requis" }, { status: 400 });
  if (mcp_url && !String(mcp_url).startsWith("https://")) return NextResponse.json({ error: "L'URL MCP doit utiliser HTTPS" }, { status: 400 });
  const { count } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true);
  const { data: subscription } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).single();
  const maxStores = subscription?.plan === "pro" ? 3 : 1;
  if ((count ?? 0) >= maxStores) return NextResponse.json({ error: `Ton plan autorise ${maxStores} boutique(s)` }, { status: 403 });
  const { data, error } = await supabase.from("stores").insert({ user_id: user.id, platform, store_name: store_name.trim(), mcp_url: mcp_url || null, access_token_encrypted: access_token ? encryptSecret(access_token) : null }).select("id, platform, store_name, mcp_url, is_active, connected_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data }, { status: 201 });
}
