import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.from("messages").select("id, store_id, role, content, created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 20000) return NextResponse.json({ error: "Le message doit contenir entre 1 et 20 000 caractères" }, { status: 400 });
  const storeId = body?.store_id || null;
  if (storeId) {
    const { data: store } = await supabase.from("stores").select("id").eq("id", storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  }
  const { data: quota, error: quotaError } = await supabase.rpc("consume_message_quota", { target_user_id: user.id });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (!quota) return NextResponse.json({ error: "Quota mensuel atteint", code: "QUOTA_EXCEEDED" }, { status: 429 });
  const { error: insertError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "user", content: message });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const answer = "Je peux analyser tes ventes, tes produits et tes opportunités. La connexion au moteur IA et aux données MCP Chariow sera ajoutée dans l'orchestrateur suivant.";
  const { data: assistant, error: assistantError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "assistant", content: answer }).select("id, role, content, created_at").single();
  if (assistantError) return NextResponse.json({ error: assistantError.message }, { status: 500 });
  return NextResponse.json({ message: assistant, usage: { used: quota.messages_used_this_month, limit: quota.messages_limit } });
}
