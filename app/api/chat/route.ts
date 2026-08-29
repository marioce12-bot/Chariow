import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askImole } from "@/lib/ai/imole";
import { getChariowSnapshot, serializeChariowContext } from "@/lib/chariow/analytics";
import { cleanAiText } from "@/lib/ai/format";
import { calculateProfitabilityAggregate } from "@/lib/profitability-aggregates";

const VENDEO_SYSTEM_PROMPT = `Tu es l'analyste business de Vendeo pour les créateurs de produits digitaux francophones.

Tu aides l'utilisateur à comprendre ses ventes, ses produits, ses clients et ses opportunités commerciales.

Règles importantes :
- Réponds toujours en français.
- Sois clair, concret et orienté action.
- N'invente jamais de chiffre et ne présente jamais une hypothèse comme une donnée réelle.
- Utilise uniquement les données réellement fournies dans le contexte.
- Si les données sont insuffisantes, dis-le clairement.
- Distingue les faits, les analyses et les recommandations.
- Utilise un format texte propre : titres simples, listes avec des tirets et paragraphes courts.
- N'entoure jamais toute ta réponse de blocs de code et n'utilise pas de balises HTML.
- N'utilise pas de Markdown gras avec des astérisques ; écris les titres directement.
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
      const message = error instanceof Error ? error.message : String(error);
      console.error("Chariow MCP error", message);
      // Token expired: MCP returns 401.
      if (message.includes("401")) {
        await supabase.from("stores").update({ connection_status: "expired", connection_error: null, last_verified_at: new Date().toISOString() }).eq("id", selectedStore.id).eq("user_id", user.id);
        context = `La connexion Chariow de ${selectedStore.store_name} a expiré. Reconnecte ta boutique Chariow pour continuer. Ne fabrique aucun chiffre.`;
      } else {
        context = `La boutique ${selectedStore.store_name} est connectée mais ses données MCP sont momentanément indisponibles. Ne fabrique aucun chiffre.`;
      }
    }
  }

  if (selectedStore) {
    const { data: profitabilitySales } = await supabase.from("chariow_sales").select("status,amount,net_amount").eq("store_id", selectedStore.id).gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString()).lte("occurred_at", new Date().toISOString());
    if (profitabilitySales?.length) context += `\nAgrégat financier persistant des 30 derniers jours : ${JSON.stringify(calculateProfitabilityAggregate({ spend: 0, sales: profitabilitySales })).slice(0, 3000)}`;
  }

  // Imole peut refuser les payloads trop volumineux (400).
  // On tronque de façon plus agressive le contexte + l'historique.
  const MAX_CONTEXT_CHARS = 6_000;
  const MAX_MESSAGE_CHARS = 1_500;
  const MAX_HISTORY_MESSAGES = 4;
  const MAX_SYSTEM_CONTENT_CHARS = 9_000;

  const safeContext =
    context.length > MAX_CONTEXT_CHARS
      ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n[... contexte tronqué ...]`
      : context;
  let answer: string;
  try {
    const reversedHistory = (history ?? []).reverse();
    const rawSystemContent = `${VENDEO_SYSTEM_PROMPT}\n\nContexte actuel :\n${safeContext}`;
    const systemContent = rawSystemContent.length > MAX_SYSTEM_CONTENT_CHARS ? `${rawSystemContent.slice(0, MAX_SYSTEM_CONTENT_CHARS)}[...system tronqué...]` : rawSystemContent;

    // Garde-fou : si le system est déjà gros, on enlève l'historique.
    const shouldIncludeHistory = systemContent.length < 7_500;

    const safeHistory = shouldIncludeHistory
      ? reversedHistory
          .slice(0, MAX_HISTORY_MESSAGES)
          .map((item) => {
            const raw = typeof item.content === "string" ? item.content : "";
            const content = raw.length > MAX_MESSAGE_CHARS ? `${raw.slice(0, MAX_MESSAGE_CHARS)}[...troncé...]` : raw;
            return { role: item.role as "user" | "assistant", content };
          })
      : [];

    answer = await askImole([{ role: "system", content: systemContent }, ...safeHistory]);
  } catch (error) {
    console.error("Imole chat error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
  }
  answer = cleanAiText(answer);
  const { data: assistant, error: assistantError } = await supabase.from("messages").insert({ user_id: user.id, store_id: storeId, role: "assistant", content: answer }).select("id, role, content, created_at").single();
  if (assistantError) return NextResponse.json({ error: assistantError.message }, { status: 500 });
  return NextResponse.json({ message: assistant, usage: { free_used: quota.free_messages_used, free_limit: quota.free_messages_limit, used: quota.messages_used_this_month, limit: quota.messages_limit, free_trial_available: quota.free_messages_used < quota.free_messages_limit } });
}
