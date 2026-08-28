import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";
import { getChariowSnapshot, serializeChariowContext } from "@/lib/chariow/analytics";

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
  let selectedStore: { id: string; mcp_url: string | null; access_token_encrypted: string | null; store_name: string } | null = null;
  if (storeId) {
    const { data: store } = await supabase.from("stores").select("id, mcp_url, access_token_encrypted, store_name").eq("id", storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
    selectedStore = store;
  } else {
    const { data: store } = await supabase.from("stores").select("id, mcp_url, access_token_encrypted, store_name").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
    selectedStore = store;
  }
  const { data: quota, error: quotaError } = await supabase.rpc("consume_message_quota", { target_user_id: user.id });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (!quota) return NextResponse.json({ error: "Tes 3 requêtes gratuites sont terminées. Choisis un plan pour continuer.", code: "PLANS_REQUIRED" }, { status: 429 });
  const { error: insertError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "user", content: message });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const { data: history } = await supabase.from("messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  let context = "Aucune boutique n'est encore sélectionnée.";
  if (selectedStore) {
    try {
      const snapshot = await getChariowSnapshot(selectedStore);
      context = `Données réelles de la boutique ${selectedStore.store_name} pour la période du mois en cours :\n${serializeChariowContext(snapshot)}`;
    } catch (error) {
      console.error("Chariow MCP error", error instanceof Error ? error.message : error);
      context = `La boutique ${selectedStore.store_name} est connectée mais ses données MCP sont momentanément indisponibles. Ne fabrique aucun chiffre.`;
    }
  }
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
  return NextResponse.json({ message: assistant, usage: { free_used: quota.free_messages_used, free_limit: quota.free_messages_limit, used: quota.messages_used_this_month, limit: quota.messages_limit, free_trial_available: quota.free_messages_used < quota.free_messages_limit } });
}
