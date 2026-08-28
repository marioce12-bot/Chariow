import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";

const VENDEO_SYSTEM_PROMPT = `Tu es l'analyste business de Vendeo pour les créateurs de produits digitaux francophones.

Tu aides l'utilisateur à comprendre ses ventes, ses produits, ses clients et ses opportunités commerciales.

Règles importantes :
- Réponds toujours en français.
- Sois clair, concret et orienté action.
- N'invente jamais de chiffre et ne présente jamais une hypothèse comme une donnée réelle.
- Utilise uniquement les données réellement fournies dans le contexte.
- Si les données sont insuffisantes, dis-le clairement.
- Distingue les faits, les analyses et les recommandations.
- Adapte tes recommandations aux créateurs africains et aux paiements en FCFA.
- Quand c'est pertinent, propose une liste d'actions prioritaires.
- Réponds de manière concise mais utile.`;

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
  const { data: history } = await supabase.from("messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  const context = storeId ? `Boutique sélectionnée : ${storeId}. Les données commerciales détaillées de Chariow seront ajoutées dans le connecteur MCP.` : "Aucune boutique n'est encore sélectionnée. Demande à l'utilisateur de connecter une boutique pour analyser des données réelles.";
  let answer: string;
  try {
    answer = await askImole([
      { role: "system", content: `${VENDEO_SYSTEM_PROMPT}\n\nContexte actuel :\n${context}` },
      ...(history ?? []).reverse().map((item) => ({ role: item.role as "user" | "assistant", content: item.content })),
    ]);
  } catch (error) {
    console.error("Imole chat error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
  }
  const { data: assistant, error: assistantError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "assistant", content: answer }).select("id, role, content, created_at").single();
  if (assistantError) return NextResponse.json({ error: assistantError.message }, { status: 500 });
  return NextResponse.json({ message: assistant, usage: { used: quota.messages_used_this_month, limit: quota.messages_limit } });
}
